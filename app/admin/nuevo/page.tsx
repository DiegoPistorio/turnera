import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";
import { NuevoTurnoForm, type Profesional, type Servicio } from "./NuevoTurnoForm";

export default async function NuevoTurnoPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: pedida } = await searchParams;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: NEGOCIO.zonaHoraria });
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoy;

  const session = await getServerSession(authOptions);
  const soloUsuario = session?.user.rol === "profesional" ? Number(session.user.id) : null;

  const servicios = await query<Servicio>(
    `SELECT id, nombre, duracion_min, precio FROM servicios WHERE activo ORDER BY id`
  );
  const profesionales = await query<Profesional>(
    `SELECT p.id, p.nombre, p.color,
            COALESCE(array_agg(ps.servicio_id) FILTER (WHERE ps.servicio_id IS NOT NULL), '{}') AS servicios
       FROM profesionales p
       LEFT JOIN profesional_servicios ps ON ps.profesional_id = p.id
      WHERE p.activo AND ($1::int IS NULL OR p.usuario_id = $1)
      GROUP BY p.id
      ORDER BY p.nombre`,
    [soloUsuario]
  );

  return (
    <main>
      <div className="flex items-center gap-1 px-5 pt-4">
        <Link
          href={`/admin?fecha=${fecha}`}
          aria-label="Volver a la agenda"
          className="-ml-3 grid size-10 place-items-center rounded-full text-3xl leading-none active:bg-ciruela-suave"
        >
          ‹
        </Link>
        <h1 className="text-[1.75rem] font-bold tracking-tight">Nuevo turno</h1>
      </div>
      <NuevoTurnoForm servicios={servicios} profesionales={profesionales} fechaInicial={fecha} />
    </main>
  );
}
