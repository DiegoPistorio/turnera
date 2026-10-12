import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";
import { CierreForm, type ProfesionalOpcion } from "./CierreForm";
import { BotonBorrarCierre } from "./BotonBorrarCierre";

type Cierre = {
  id: number;
  profesional: string | null;
  color: string | null;
  motivo: string | null;
  desde: string;
  hasta: string;
  hora_desde: string;
  hora_hasta: string;
  dia_completo: boolean;
};

const TZ = NEGOCIO.zonaHoraria;

function fecha(iso: string) {
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
}

export default async function CierresPage() {
  const session = await getServerSession(authOptions);
  const soloUsuario = session?.user.rol === "profesional" ? Number(session.user.id) : null;

  const profesionales = await query<ProfesionalOpcion>(
    `SELECT id, nombre, color FROM profesionales
      WHERE activo AND ($1::int IS NULL OR usuario_id = $1)
      ORDER BY nombre`,
    [soloUsuario]
  );

  // Próximos cierres. "hasta" es el último día afectado (fin - 1 microsegundo)
  const cierres = await query<Cierre>(
    `SELECT b.id, b.motivo, p.nombre AS profesional, p.color,
            to_char(b.inicio AT TIME ZONE $1, 'YYYY-MM-DD') AS desde,
            to_char((b.fin - interval '1 microsecond') AT TIME ZONE $1, 'YYYY-MM-DD') AS hasta,
            to_char(b.inicio AT TIME ZONE $1, 'HH24:MI') AS hora_desde,
            to_char(b.fin AT TIME ZONE $1, 'HH24:MI') AS hora_hasta,
            (to_char(b.inicio AT TIME ZONE $1, 'HH24:MI') = '00:00'
             AND to_char(b.fin AT TIME ZONE $1, 'HH24:MI') = '00:00') AS dia_completo
       FROM bloqueos b
       LEFT JOIN profesionales p ON p.id = b.profesional_id
      WHERE b.fin > now()
        AND ($2::int IS NULL OR b.profesional_id IS NULL OR p.usuario_id = $2)
      ORDER BY b.inicio`,
    [TZ, soloUsuario]
  );

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: TZ });

  return (
    <main className="pb-16">
      <div className="flex items-center gap-1 px-5 pt-4">
        <Link
          href="/admin/mas"
          aria-label="Volver"
          className="-ml-3 grid size-10 place-items-center rounded-full text-3xl leading-none active:bg-acento-suave"
        >
          ‹
        </Link>
        <h1 className="font-titulo text-[1.75rem] font-bold tracking-tight">Días sin atención</h1>
      </div>
      <p className="px-5 pt-1 text-sm text-suave">
        Feriados, vacaciones o cualquier día que no atiendan. Esos horarios dejan de aparecer en la reserva.
      </p>

      <CierreForm
        profesionales={profesionales}
        hoy={hoy}
        puedeCerrarLocal={soloUsuario === null}
      />

      <section className="mt-10">
        <h2 className="px-5 text-lg font-semibold">Próximos cierres</h2>
        {cierres.length === 0 ? (
          <p className="mx-5 mt-3 rounded-2xl border border-dashed border-borde px-5 py-8 text-center text-suave">
            No hay cierres cargados.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-borde border-y border-borde bg-superficie">
            {cierres.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className="w-1 self-stretch rounded-full"
                  style={{ backgroundColor: c.color ?? "var(--color-acento)" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold first-letter:uppercase">
                    {c.desde === c.hasta ? fecha(c.desde) : `${fecha(c.desde)} al ${fecha(c.hasta)}`}
                    {!c.dia_completo && (
                      <span className="text-suave">
                        {" "}
                        · {c.hora_desde} a {c.hora_hasta}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-suave">
                    {c.profesional ?? "Todo el local"}
                    {c.motivo ? `, ${c.motivo}` : ""}
                  </p>
                </div>
                <BotonBorrarCierre id={c.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
