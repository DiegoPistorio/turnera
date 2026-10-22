import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { urlDePago, urlPublica } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /turno/<token>/pagar → vuelve a abrir el pago de la seña (si se rechazó o se cerró la pestaña)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const volver = NextResponse.redirect(urlPublica(`/turno/${UUID.test(token) ? token : ""}`));
  if (!UUID.test(token)) return volver;

  const [t] = await query<{ mp_preferencia_id: string | null }>(
    `SELECT mp_preferencia_id FROM turnos
      WHERE token = $1 AND estado = 'pendiente' AND vence_en > now()`,
    [token]
  );
  if (!t?.mp_preferencia_id) return volver; // ya se pagó o venció: la página muestra cómo quedó

  try {
    return NextResponse.redirect(await urlDePago(t.mp_preferencia_id));
  } catch (e) {
    console.error("No se pudo obtener el link de pago:", e);
    return NextResponse.redirect(urlPublica(`/turno/${token}?error=pago`));
  }
}
