import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";
import { obtenerDisponibilidad, obtenerDisponibilidadCualquiera } from "@/lib/disponibilidad";

export const dynamic = "force-dynamic";

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

// POST /api/turnos → crea un turno desde la reserva pública
// body: { servicioId, profesionalId (0 = el primero disponible), inicio (ISO), nombre, telefono }
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
    // 1. Confirmar que el horario sigue libre y ver qué profesionales pueden tomarlo
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

    // 2. Guardar cliente y turno en una transacción
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
          const { rows: [turno] } = await client.query(
            `INSERT INTO turnos (cliente_id, profesional_id, servicio_id, inicio, fin, precio, origen)
             VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz + make_interval(mins => $5::int), $6, 'web')
             RETURNING id, token`,
            [cliente.id, pid, servicioId, inicio, servicio.duracion_min, servicio.precio]
          );
          await client.query("COMMIT");

          const [prof] = await query<{ nombre: string }>(
            `SELECT nombre FROM profesionales WHERE id = $1`,
            [pid]
          );
          return NextResponse.json(
            {
              id: turno.id,
              token: turno.token,
              servicio: servicio.nombre,
              profesional: prof.nombre,
              precio: servicio.precio,
              hora: new Date(inicio).toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                timeZone: NEGOCIO.zonaHoraria,
              }),
            },
            { status: 201 }
          );
        } catch (e) {
          // 23P01 = la exclusion constraint frenó una superposición: probamos con el siguiente
          if ((e as { code?: string }).code === "23P01") {
            await client.query("ROLLBACK TO SAVEPOINT intento");
            continue;
          }
          throw e;
        }
      }

      await client.query("ROLLBACK");
      return error("Ese horario se acaba de ocupar. Elegí otro.", 409);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return error("No se pudo reservar el turno. Probá de nuevo.", 500);
  }
}
