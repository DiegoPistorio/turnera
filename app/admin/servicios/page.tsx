import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

type FilaServicio = {
  id: number;
  nombre: string;
  duracion_min: number;
  precio: string;
  activo: boolean;
  profesionales: string | null;
};

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default async function ServiciosPage() {
  const session = await getServerSession(authOptions);
  if (session?.user.rol === "profesional") redirect("/admin");

  const servicios = await query<FilaServicio>(
    `SELECT s.id, s.nombre, s.duracion_min, s.precio, s.activo,
            string_agg(p.nombre, ', ' ORDER BY p.nombre) AS profesionales
       FROM servicios s
       LEFT JOIN profesional_servicios ps ON ps.servicio_id = s.id
       LEFT JOIN profesionales p ON p.id = ps.profesional_id AND p.activo
      GROUP BY s.id
      ORDER BY s.activo DESC, s.nombre`
  );

  return (
    <main className="pb-28">
      <div className="flex items-center gap-1 px-5 pt-4">
        <Link
          href="/admin/mas"
          aria-label="Volver"
          className="-ml-3 grid size-10 place-items-center rounded-full text-3xl leading-none active:bg-acento-suave"
        >
          ‹
        </Link>
        <h1 className="font-titulo text-[1.75rem] font-bold tracking-tight">Servicios y precios</h1>
      </div>
      <p className="px-5 pt-1 text-sm text-suave">
        Los cambios de precio se aplican a los turnos nuevos; los ya reservados mantienen su precio.
      </p>

      {servicios.length === 0 ? (
        <p className="mx-5 mt-6 rounded-2xl border border-dashed border-borde px-5 py-10 text-center text-suave">
          Todavía no hay servicios. Agregá el primero.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-borde border-y border-borde bg-superficie">
          {servicios.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/servicios/${s.id}`}
                className={`flex items-center gap-4 px-5 py-4 active:bg-acento-suave ${s.activo ? "" : "opacity-55"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-lg font-semibold">
                    <span className="truncate">{s.nombre}</span>
                    {!s.activo && (
                      <span className="shrink-0 rounded-full bg-borde px-2 py-0.5 text-xs font-semibold text-suave">
                        Pausado
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-suave">
                    {s.duracion_min} min · {s.profesionales ?? "Ningún peluquero asignado"}
                  </p>
                </div>
                <span className="text-lg font-semibold tabular-nums">{pesos.format(Number(s.precio))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div
        className="fixed inset-x-0 bottom-0 border-t border-borde bg-fondo/95 px-5 pt-3 backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Link
          href="/admin/servicios/nuevo"
          className="mx-auto flex h-14 max-w-2xl items-center justify-center rounded-2xl bg-acento text-lg font-semibold text-sobre-acento active:scale-[0.98]"
        >
          + Agregar servicio
        </Link>
      </div>
    </main>
  );
}
