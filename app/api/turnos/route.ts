import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";
import { obtenerDisponibilidad, obtenerDisponibilidadCualquiera, vencerPendientes } from "@/lib/disponibilidad";
import { crearPreferencia, cuentaVinculada } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

// POST /api/turnos → crea un turno desde la reserva pública
// body: { servicioId, profesionalId (0 = el primero disponible), inicio (ISO), nombre, telefono }
// El turno queda "pendiente" y guarda el horario hasta que se pague la seña o venza el plazo.
// Responde { token, pagoUrl }: el cliente sigue a Mercado Pago y vuelve a /turno/<token>.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error("Datos inválidos", 400);
  }

  const servicioId = Number(body.servicioId);
  const profesionalId = Number(body.profesionalId ?? 0);
  const inicioRaw = String(body.inicio ?? "");
  const nombre = String(body.nombre ?? "").trim();
  const telefono = String(body.telefono ?? "").replace(/\D/g, "");

  if (!servicioId || !Number.isInteger(profesionalId) || Number.isNaN(Date.parse(inicioRaw))) {
    return error("Faltan datos del turno", 400);
  }
  if (nombre.length < 2) return error("Ingresá tu nombre.", 400);
  if (telefono.length < 8 || telefono.length > 15) {
    return error("Ingresá tu celular con característica, por ejemplo 11 2345 6789.", 400);
  }

  const inicio = new Date(inicioRaw).toISOString();
  const fecha = new Date(inicio).toLocaleDateString("en-CA", { timeZone: NEGOCIO.zonaHoraria });

  try {
    // Sin cuenta de Mercado Pago no se puede cobrar la seña: no se toman reservas web
    if (!(await cuentaVinculada())) {
      return error("Las reservas online no están disponibles en este momento. Escribinos por WhatsApp.", 503);
    }

    // 1. Confirmar que el horario sigue libre y ver qué profesionales pueden tomarlo
    await vencerPendientes();
    let candidatos: number[] = [];
    if (profesionalId > 0) {
      const slots = await obtenerDisponibilidad(profesionalId, servicioId, fecha);
      if (slots.some((s) => s.inicio === inicio)) candidatos = [profesionalId];
    } else {
      const slots = await obtenerDisponibilidadCualquiera(servicioId, fecha);
      candidatos = slots.find((s) => s.inicio === inicio)?.profesionales ?? [];
    }
    if (candidatos.length === 0) {
      return error("Ese horario ya no está disponible. Elegí otro.", 409);
    }

    const [servicio] = await query<{ nombre: string; duracion_min: number; precio: string }>(
      `SELECT nombre, duracion_min, precio FROM servicios WHERE id = $1 AND activo`,
      [servicioId]
    );
    if (!servicio) return error("El servicio no existe.", 400);

    // 2. Guardar cliente y turno pendiente en una transacción
    let turno: { id: number; token: string; vence_en: Date } | null = null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [cliente] } = await client.query(
        `INSERT INTO clientes (nombre, telefono) VALUES ($1, $2)
         ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id`,
        [nombre, telefono]
      );

      for (const pid of candidatos) {
        await client.query("SAVEPOINT intento");
        try {
          const { rows: [t] } = await client.query(
            `INSERT INTO turnos (cliente_id, profesional_id, servicio_id, inicio, fin, precio, origen,
                                 estado, sena, vence_en)
             VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz + make_interval(mins => $5::int), $6, 'web',
                     'pendiente', $7, now() + make_interval(mins => $8::int))
             RETURNING id, token, vence_en`,
            [cliente.id, pid, servicioId, inicio, servicio.duracion_min, servicio.precio,
             NEGOCIO.sena.monto, NEGOCIO.sena.minutosParaPagar]
          );
          turno = t;
          break;
        } catch (e) {
          // 23P01 = la exclusion constraint frenó una superposición: probamos con el siguiente
          if ((e as { code?: string }).code === "23P01") {
            await client.query("ROLLBACK TO SAVEPOINT intento");
            continue;
          }
          throw e;
        }
      }

      if (!turno) {
        await client.query("ROLLBACK");
        return error("Ese horario se acaba de ocupar. Elegí otro.", 409);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    // 3. Preferencia de pago en Mercado Pago (con la cuenta de la barbería)
    try {
      const preferencia = await crearPreferencia({
        turnoToken: turno.token,
        titulo: `Seña ${servicio.nombre} - ${NEGOCIO.nombre}`,
        monto: NEGOCIO.sena.monto,
        venceEn: turno.vence_en,
      });
      await query(`UPDATE turnos SET mp_preferencia_id = $2 WHERE id = $1`, [turno.id, preferencia.id]);
      return NextResponse.json({ token: turno.token, pagoUrl: preferencia.initPoint }, { status: 201 });
    } catch (e) {
      // Sin link de pago el turno no se puede confirmar: se libera el horario enseguida
      console.error("No se pudo crear la preferencia de Mercado Pago:", e);
      await query(`UPDATE turnos SET estado = 'vencido' WHERE id = $1 AND estado = 'pendiente'`, [turno.id]);
      return error("No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.", 502);
    }
  } catch (err) {
    console.error(err);
    return error("No se pudo reservar el turno. Probá de nuevo.", 500);
  }
}
