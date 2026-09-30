"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

const ESTADOS = ["confirmado", "completado", "ausente", "cancelado"];

export async function cambiarEstado(id: number, estado: string): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Tu sesión venció. Volvé a ingresar." };
  if (!ESTADOS.includes(estado)) return { error: "Estado inválido." };

  // Un profesional solo puede tocar sus propios turnos; el admin, todos
  const soloUsuario = session.user.rol === "profesional" ? Number(session.user.id) : null;

  try {
    await query(
      `UPDATE turnos t
          SET estado = $2
         FROM profesionales p
        WHERE t.id = $1
          AND p.id = t.profesional_id
          AND ($3::int IS NULL OR p.usuario_id = $3)`,
      [id, estado, soloUsuario]
    );
  } catch (e) {
    // Reactivar un turno cancelado cuyo horario ya tomó otra persona
    if ((e as { code?: string }).code === "23P01") {
      return { error: "Ese horario ya lo ocupa otro turno. No se puede reactivar." };
    }
    throw e;
  }

  revalidatePath("/admin");
  return {};
}
