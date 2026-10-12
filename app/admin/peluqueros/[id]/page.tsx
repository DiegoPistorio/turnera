import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";
import { PeluqueroForm, type PeluqueroInicial } from "./PeluqueroForm";

export default async function EditarPeluqueroPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user.rol === "profesional") redirect("/admin");

  const { id } = await params;
  const servicios = await query<{ id: number; nombre: string; activo: boolean }>(
    `SELECT id, nombre, activo FROM servicios ORDER BY activo DESC, nombre`
  );

  let inicial: PeluqueroInicial;
  if (id === "nuevo") {
    inicial = {
      id: null,
      nombre: "",
      color: "",
      dias: NEGOCIO.diasAtencion,
      servicios: servicios.filter((s) => s.activo).map((s) => s.id),
      activo: true,
      acceso: false,
      email: "",
      tieneUsuario: false,
      turnosFuturos: 0,
    };
  } else {
    const num = Number(id);
    if (!Number.isInteger(num)) notFound();
    const [p] = await query<{
      id: number;
      nombre: string;
      color: string;
      activo: boolean;
      dias: number[];
      servicios: number[];
      email: string | null;
      acceso: boolean;
      tiene_usuario: boolean;
      turnos_futuros: number;
    }>(
      `SELECT p.id, p.nombre, p.color, p.activo,
              COALESCE((SELECT array_agg(DISTINCT dia_semana) FROM horarios WHERE profesional_id = p.id), '{}') AS dias,
              COALESCE((SELECT array_agg(servicio_id) FROM profesional_servicios WHERE profesional_id = p.id), '{}') AS servicios,
              u.email, COALESCE(u.activo, false) AS acceso, (u.id IS NOT NULL) AS tiene_usuario,
              (SELECT count(*)::int FROM turnos t
                WHERE t.profesional_id = p.id AND t.inicio > now()
                  AND t.estado IN ('pendiente', 'confirmado')) AS turnos_futuros
         FROM profesionales p
         LEFT JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.id = $1`,
      [num]
    );
    if (!p) notFound();
    inicial = {
      id: p.id,
      nombre: p.nombre,
      color: p.color,
      dias: p.dias,
      servicios: p.servicios,
      activo: p.activo,
      acceso: p.acceso,
      email: p.email ?? "",
      tieneUsuario: p.tiene_usuario,
      turnosFuturos: p.turnos_futuros,
    };
  }

  return (
    <main>
      <div className="flex items-center gap-1 px-5 pt-4">
        <Link
          href="/admin/peluqueros"
          aria-label="Volver a peluqueros"
          className="-ml-3 grid size-10 place-items-center rounded-full text-3xl leading-none active:bg-acento-suave"
        >
          ‹
        </Link>
        <h1 className="font-titulo text-[1.75rem] font-bold tracking-tight">
          {inicial.id === null ? "Nuevo peluquero" : inicial.nombre}
        </h1>
      </div>
      <PeluqueroForm
        inicial={inicial}
        servicios={servicios}
        horario={`${NEGOCIO.horario.apertura} a ${NEGOCIO.horario.cierre}`}
        diasAtencion={NEGOCIO.diasAtencion}
      />
    </main>
  );
}
