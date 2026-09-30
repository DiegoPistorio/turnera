import { NextRequest, NextResponse } from "next/server";
import { obtenerDisponibilidad, obtenerDisponibilidadCualquiera } from "@/lib/disponibilidad";

export const dynamic = "force-dynamic";

// GET /api/disponibilidad?profesional=1&servicio=2&fecha=2026-10-01
// profesional=0 significa "el primero disponible"
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const profesional = Number(p.get("profesional"));
  const servicio = Number(p.get("servicio"));
  const fecha = p.get("fecha") ?? "";

  if (!Number.isInteger(profesional) || profesional < 0 || !servicio || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  try {
    const slots =
      profesional === 0
        ? await obtenerDisponibilidadCualquiera(servicio, fecha)
        : await obtenerDisponibilidad(profesional, servicio, fecha);
    return NextResponse.json({ slots });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error al calcular disponibilidad" }, { status: 500 });
  }
}
