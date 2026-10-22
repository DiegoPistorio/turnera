import { NextRequest, NextResponse } from "next/server";
import { firmaWebhookValida } from "@/lib/mercadopago";
import { procesarPago } from "@/lib/pagos";

export const dynamic = "force-dynamic";

// POST /api/mercadopago/webhook → Mercado Pago avisa que un pago cambió.
// Formatos: webhook ({ type: "payment", data: { id } } y ?data.id=...) e IPN viejo (?topic=payment&id=...).
// Responder 200 rápido; si algo falla devolvemos 500 y Mercado Pago reintenta más tarde.
export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  let body: { type?: string; topic?: string; data?: { id?: string | number } } = {};
  try {
    body = await req.json();
  } catch {}

  const tipo = body.type ?? body.topic ?? q.get("type") ?? q.get("topic");
  const pagoId = String(q.get("data.id") ?? body.data?.id ?? q.get("id") ?? "");
  if (tipo !== "payment" || !/^\d+$/.test(pagoId)) {
    return NextResponse.json({ ok: true, ignorado: true }); // otros avisos (merchant_order, etc.) no nos interesan
  }

  // Si viene firmada, la firma tiene que ser válida. Igual el pago se consulta a Mercado Pago antes de tocar nada.
  const firma = req.headers.get("x-signature");
  if (firma && !firmaWebhookValida(firma, req.headers.get("x-request-id"), q.get("data.id") ?? pagoId)) {
    console.error(`Webhook de Mercado Pago con firma inválida (pago ${pagoId})`);
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  try {
    const resultado = await procesarPago(pagoId);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    console.error(`Error procesando el pago ${pagoId} de Mercado Pago:`, e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
