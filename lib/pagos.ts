import { pool, query } from "@/lib/db";
import { buscarPagosDeTurno, cuentaVinculada, ErrorMercadoPago, obtenerPago, reembolsarPago } from "@/lib/mercadopago";

// Qué hace la app con los pagos de seña que informa Mercado Pago.
// Nunca confía en lo que llega en una notificación: siempre consulta el pago con el token de la barbería.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Resultado = "confirmado" | "reembolsado" | "registrado" | "ignorado";

// Procesa un pago: lo registra y, la primera vez que se ve aprobado, confirma el turno.
// Es idempotente: el webhook, la vuelta del cliente y la reconciliación pueden pasar varias veces por el mismo pago.
export async function procesarPago(paymentId: string | number): Promise<Resultado> {
  let pago;
  try {
    pago = await obtenerPago(paymentId);
  } catch (e) {
    if (e instanceof ErrorMercadoPago && e.status === 404) return "ignorado";
    throw e;
  }

  // Solo cuentan los cobros hechos en la cuenta de la barbería y para un turno de esta app
  const cuenta = await cuentaVinculada();
  if (!cuenta || String(pago.collector_id) !== cuenta.mpUserId) return "ignorado";
  if (!pago.external_reference || !UUID.test(pago.external_reference)) return "ignorado";

  let resultado: Resultado = "registrado";
  let devolver = false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // El turno bloqueado: si llegan dos avisos juntos, se procesan de a uno
    const { rows: [turno] } = await client.query(
      `SELECT id, estado, sena FROM turnos WHERE token = $1 FOR UPDATE`,
      [pago.external_reference]
    );
    if (!turno) {
      await client.query("ROLLBACK");
      return "ignorado";
    }

    const { rows: [anterior] } = await client.query(`SELECT estado FROM pagos WHERE mp_payment_id = $1`, [pago.id]);
    await client.query(
      `INSERT INTO pagos (turno_id, mp_payment_id, monto, estado, estado_detalle)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (mp_payment_id) DO UPDATE
         SET estado = EXCLUDED.estado, estado_detalle = EXCLUDED.estado_detalle, actualizado_en = now()`,
      [turno.id, pago.id, pago.transaction_amount, pago.status, pago.status_detail]
    );

    const recienAprobado = pago.status === "approved" && anterior?.estado !== "approved";
    const alcanza = pago.currency_id === "ARS" && pago.transaction_amount >= Number(turno.sena);

    if (recienAprobado && !alcanza) {
      console.error(`Pago ${pago.id} aprobado por un monto menor a la seña del turno ${turno.id}`);
    } else if (recienAprobado) {
      if (turno.estado === "pendiente") {
        await client.query(`UPDATE turnos SET estado = 'confirmado' WHERE id = $1`, [turno.id]);
        resultado = "confirmado";
      } else if (turno.estado === "vencido") {
        // Pagó tarde: si el horario sigue libre, el turno revive; si ya lo tomó otro, se devuelve la seña
        await client.query("SAVEPOINT revivir");
        try {
          await client.query(`UPDATE turnos SET estado = 'confirmado' WHERE id = $1`, [turno.id]);
          resultado = "confirmado";
        } catch (e) {
          if ((e as { code?: string }).code !== "23P01") throw e;
          await client.query("ROLLBACK TO SAVEPOINT revivir");
          devolver = true;
        }
      } else {
        // Ya estaba pago por otro intento (pagó dos veces) o el turno se canceló antes de pagar: se devuelve
        devolver = true;
      }
      if (devolver) {
        await client.query(
          `UPDATE pagos SET reembolso_estado = 'pendiente', actualizado_en = now() WHERE mp_payment_id = $1`,
          [pago.id]
        );
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  // El reembolso va después del COMMIT: no se mantiene la base bloqueada esperando a Mercado Pago
  if (devolver) {
    await devolverPago(pago.id);
    resultado = "reembolsado";
  }
  return resultado;
}

// Devuelve la seña completa y deja anotado cómo salió. Si falla (por ejemplo, la barbería no tiene saldo)
// queda en "error" para reintentarlo desde el panel; la clave de idempotencia evita devolver dos veces.
export async function devolverPago(mpPaymentId: string | number): Promise<{ error?: string }> {
  try {
    await reembolsarPago(mpPaymentId);
    await query(
      `UPDATE pagos SET reembolso_estado = 'hecho', reembolso_error = NULL, reembolsado_en = now(), actualizado_en = now()
        WHERE mp_payment_id = $1`,
      [mpPaymentId]
    );
    return {};
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`No se pudo devolver el pago ${mpPaymentId}:`, e);
    await query(
      `UPDATE pagos SET reembolso_estado = 'error', reembolso_error = $2, actualizado_en = now() WHERE mp_payment_id = $1`,
      [mpPaymentId, mensaje]
    );
    return { error: mensaje };
  }
}

// Respaldo por si el webhook no llega o se demora: busca en Mercado Pago los pagos del turno.
// Si el cliente vuelve con el payment_id en la URL, se consulta ese directamente.
export async function reconciliarTurno(token: string, paymentId?: string) {
  if (paymentId && /^\d+$/.test(paymentId)) {
    await procesarPago(paymentId);
    return;
  }
  const pagos = await buscarPagosDeTurno(token);
  for (const p of pagos) {
    if (p.status === "approved") await procesarPago(p.id);
  }
}
