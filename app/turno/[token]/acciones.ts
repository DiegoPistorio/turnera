"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";
import { cancelarTurno } from "@/lib/pagos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El cliente cancela su turno desde "Mi turno". El token es la llave: quien tiene el link, tiene el turno.
// La seña no se devuelve, y solo se puede hasta unas horas antes.
export async function cancelarPorCliente(token: string): Promise<{ error?: string }> {
  if (!UUID.test(token)) return { error: "El turno no existe." };
  const [t] = await query<{ id: number; estado: string }>(`SELECT id, estado FROM turnos WHERE token = $1`, [token]);
  if (!t) return { error: "El turno no existe." };
  if (t.estado !== "confirmado") return { error: "Este turno ya no se puede cancelar." };

  const h = NEGOCIO.sena.horasMinimasCancelacion;
  const r = await cancelarTurno(t.id, "cliente", { horasAntes: h });
  if (r.error === "Ya pasó el plazo para cancelar.") {
    return { error: `Solo se puede cancelar hasta ${h} ${h === 1 ? "hora" : "horas"} antes. Escribile a la barbería.` };
  }

  revalidatePath(`/turno/${token}`);
  return { error: r.error };
}
