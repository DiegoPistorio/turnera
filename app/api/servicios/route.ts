import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/servicios → servicios activos
export async function GET() {
  try {
    const servicios = await query(
      `SELECT id, nombre, descripcion, duracion_min, precio
         FROM servicios
        WHERE activo
        ORDER BY id`
    );
    return NextResponse.json({ servicios });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudieron cargar los servicios" }, { status: 500 });
  }
}
