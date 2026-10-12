import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ServicioForm, type ServicioInicial } from "./ServicioForm";

export default async function EditarServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user.rol === "profesional") redirect("/admin");

  const { id } = await params;
  const profesionales = await query<{ id: number; nombre: string; color: string }>(
    `SELECT id, nombre, color FROM profesionales WHERE activo ORDER BY nombre`
  );

  let inicial: ServicioInicial;
  if (id === "nuevo") {
    inicial = {
      id: null,
      nombre: "",
      descripcion: "",
      duracionMin: 30,
      precio: "",
      activo: true,
      profesionales: profesionales.map((p) => p.id),
      turnos: 0,
    };
  } else {
    const num = Number(id);
    if (!Number.isInteger(num)) notFound();
    const [s] = await query<{
      id: number;
      nombre: string;
      descripcion: string | null;
      duracion_min: number;
      precio: string;
      activo: boolean;
      profesionales: number[];
      turnos: number;
    }>(
      `SELECT s.id, s.nombre, s.descripcion, s.duracion_min, s.precio, s.activo,
              COALESCE(array_agg(ps.profesional_id) FILTER (WHERE ps.profesional_id IS NOT NULL), '{}') AS profesionales,
              (SELECT count(*)::int FROM turnos t WHERE t.servicio_id = s.id) AS turnos
         FROM servicios s
         LEFT JOIN profesional_servicios ps ON ps.servicio_id = s.id
        WHERE s.id = $1
        GROUP BY s.id`,
      [num]
    );
    if (!s) notFound();
    inicial = {
      id: s.id,
      nombre: s.nombre,
      descripcion: s.descripcion ?? "",
      duracionMin: s.duracion_min,
      precio: String(Number(s.precio)),
      activo: s.activo,
      profesionales: s.profesionales,
      turnos: s.turnos,
    };
  }

  return (
    <main>
      <div className="flex items-center gap-1 px-5 pt-4">
        <Link
          href="/admin/servicios"
          aria-label="Volver a servicios"
          className="-ml-3 grid size-10 place-items-center rounded-full text-3xl leading-none active:bg-acento-suave"
        >
          ‹
        </Link>
        <h1 className="font-titulo text-[1.75rem] font-bold tracking-tight">
          {inicial.id === null ? "Nuevo servicio" : "Editar servicio"}
        </h1>
      </div>
      <ServicioForm inicial={inicial} profesionales={profesionales} />
    </main>
  );
}
