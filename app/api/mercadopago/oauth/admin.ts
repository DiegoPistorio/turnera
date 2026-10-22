import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

// Estas rutas no pasan por el layout del panel: verifican acá que sea un admin activo
export async function adminActivo(): Promise<number | null> {
  const session = await getServerSession(authOptions);
  if (!session || session.user.rol === "profesional") return null;
  const [u] = await query<{ id: number }>(`SELECT id FROM usuarios WHERE id = $1 AND activo`, [
    Number(session.user.id),
  ]);
  return u?.id ?? null;
}

// Guarda el state y el code_verifier entre la ida a Mercado Pago y la vuelta
export const COOKIE_OAUTH = "mp_oauth";
