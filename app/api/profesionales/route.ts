import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/profesionales?servicio=2 → profesionales activos que hacen ese servicio
export async function GET(req: NextRequest) {
  const servicio = Number(req.nextUrl.searchParams.get("servicio"));
  if (!servicio) {
    return NextResponse.json({ error: "Falta el servicio" }, { status: 400 });
  }
  try {
    const profesionales = await query(
      `SELECT p.id, p.nombre, p.color
         FROM profesionales p
         JOIN profesional_servicios ps ON ps.profesional_id = p.id
        WHERE ps.servicio_id = $1 AND p.activo
        ORDER BY p.nombre`,
      [servicio]
    );
    return NextResponse.json({ profesionales });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudieron cargar los profesionales" }, { status: 500 });
  }
}
