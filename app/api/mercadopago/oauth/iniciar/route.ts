import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { nuevoPkce, problemasDeConfiguracion, urlAutorizacion, urlPublica } from "@/lib/mercadopago";
import { adminActivo, COOKIE_OAUTH } from "../admin";

export const dynamic = "force-dynamic";

// GET /api/mercadopago/oauth/iniciar → manda al admin a autorizar la app en Mercado Pago
export async function GET() {
  if (!(await adminActivo())) return NextResponse.redirect(urlPublica("/login"));
  if (problemasDeConfiguracion().length > 0) {
    return NextResponse.redirect(urlPublica("/admin/mercadopago?error=configuracion"));
  }

  const state = randomBytes(16).toString("hex");
  const { verifier, challenge } = nuevoPkce();

  const res = NextResponse.redirect(urlAutorizacion(state, challenge));
  res.cookies.set(COOKIE_OAUTH, JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: process.env.NEXTAUTH_URL?.startsWith("https://"),
    sameSite: "lax", // tiene que viajar en la redirección de vuelta desde Mercado Pago
    path: "/api/mercadopago/oauth",
    maxAge: 10 * 60, // el code de Mercado Pago dura 10 minutos
  });
  return res;
}
