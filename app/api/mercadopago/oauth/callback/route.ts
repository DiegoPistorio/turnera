import { NextRequest, NextResponse } from "next/server";
import { urlPublica, vincularCuenta } from "@/lib/mercadopago";
import { adminActivo, COOKIE_OAUTH } from "../admin";

export const dynamic = "force-dynamic";

// GET /api/mercadopago/oauth/callback?code=...&state=... → Mercado Pago vuelve acá después de autorizar
export async function GET(req: NextRequest) {
  const volver = (resultado: string) => {
    const res = NextResponse.redirect(urlPublica(`/admin/mercadopago?${resultado}`));
    res.cookies.delete({ name: COOKIE_OAUTH, path: "/api/mercadopago/oauth" });
    return res;
  };

  const usuarioId = await adminActivo();
  if (!usuarioId) return NextResponse.redirect(urlPublica("/login"));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code) return volver("error=cancelado"); // el admin no autorizó, o Mercado Pago devolvió un error

  // El state tiene que ser el que generamos al iniciar: si no, el pedido no salió de este panel
  let guardado: { state?: string; verifier?: string } = {};
  try {
    guardado = JSON.parse(req.cookies.get(COOKIE_OAUTH)?.value ?? "{}");
  } catch {}
  if (!state || !guardado.verifier || guardado.state !== state) return volver("error=vencido");

  try {
    await vincularCuenta(code, guardado.verifier, usuarioId);
  } catch (e) {
    console.error("No se pudo vincular la cuenta de Mercado Pago:", e);
    return volver("error=mercadopago");
  }
  return volver("vinculada=1");
}
