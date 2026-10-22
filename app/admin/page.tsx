import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";
import { linkWhatsApp } from "@/lib/telefono";
import { BotonEstado } from "./BotonEstado";

type TurnoAgenda = {
  id: number;
  hora: string;
  hora_fin: string;
  estado: string;
  precio: string;
  notas: string | null;
  cliente: string;
  telefono: string;
  servicio: string;
  profesional: string;
  color: string;
};

const TZ = NEGOCIO.zonaHoraria;
const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const ETIQUETA: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  completado: "Atendido",
  ausente: "No vino",
  cancelado: "Cancelado",
};
const ESTILO: Record<string, string> = {
  pendiente: "bg-amber-400/15 text-amber-300",
  confirmado: "bg-acento-suave text-acento",
  completado: "bg-emerald-400/15 text-emerald-300",
  ausente: "bg-orange-400/15 text-orange-300",
  cancelado: "bg-borde text-suave",
};

const SQL = `
  SELECT t.id, t.estado, t.precio, t.notas,
         to_char(t.inicio AT TIME ZONE $2, 'HH24:MI') AS hora,
         to_char(t.fin    AT TIME ZONE $2, 'HH24:MI') AS hora_fin,
         c.nombre AS cliente, c.telefono,
         s.nombre AS servicio,
         p.nombre AS profesional, p.color
    FROM turnos t
    JOIN clientes c      ON c.id = t.cliente_id
    JOIN servicios s     ON s.id = t.servicio_id
    JOIN profesionales p ON p.id = t.profesional_id
   WHERE (t.inicio AT TIME ZONE $2)::date = $1::date
     AND ($3::int IS NULL OR p.usuario_id = $3)
     AND NOT (t.estado = 'vencido' OR (t.estado = 'pendiente' AND t.vence_en < now())) -- web impagos: nunca existieron
   ORDER BY t.inicio, p.nombre`;

function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function sumarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatear(iso: string, opciones: Intl.DateTimeFormatOptions) {
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("es-AR", { ...opciones, timeZone: TZ });
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: pedida } = await searchParams;
  const hoy = hoyISO();
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoy;

  const session = await getServerSession(authOptions);
  const soloUsuario = session?.user.rol === "profesional" ? Number(session.user.id) : null;
  const turnos = await query<TurnoAgenda>(SQL, [fecha, TZ, soloUsuario]);

  const activos = turnos.filter((t) => t.estado !== "cancelado");
  const estimado = activos.filter((t) => t.estado !== "ausente").reduce((suma, t) => suma + Number(t.precio), 0);

  const titulo =
    fecha === hoy
      ? "Hoy"
      : fecha === sumarDias(hoy, 1)
        ? "Mañana"
        : fecha === sumarDias(hoy, -1)
          ? "Ayer"
          : formatear(fecha, { weekday: "long" });
  const cuando = fecha === hoy ? "hoy" : `el ${formatear(fecha, { weekday: "long", day: "numeric" })}`;

  const flecha =
    "grid size-11 place-items-center rounded-full border border-borde bg-superficie text-2xl leading-none active:bg-acento-suave";

  return (
    <main className="pb-24">
      <section className="px-5 pt-5">
        <div className="flex items-center justify-between">
          <Link href={`/admin?fecha=${sumarDias(fecha, -1)}`} aria-label="Día anterior" className={flecha}>
            ‹
          </Link>
          <div className="text-center">
            <h1 className="text-[1.75rem] font-titulo font-bold leading-tight tracking-tight first-letter:uppercase">{titulo}</h1>
            <p className="text-sm text-suave">{formatear(fecha, { day: "numeric", month: "long" })}</p>
          </div>
          <Link href={`/admin?fecha=${sumarDias(fecha, 1)}`} aria-label="Día siguiente" className={flecha}>
            ›
          </Link>
        </div>

        {fecha !== hoy && (
          <Link href="/admin" className="mx-auto mt-2 block w-fit text-sm font-semibold text-acento">
            Volver a hoy
          </Link>
        )}

        <p className="mt-5 text-sm text-suave">
          {activos.length === 1 ? "1 turno" : `${activos.length} turnos`}
          {activos.length > 0 && `, ${pesos.format(estimado)} estimado`}
        </p>
      </section>

      {turnos.length === 0 ? (
        <p className="mx-5 mt-3 rounded-2xl border border-dashed border-borde px-5 py-10 text-center text-suave">
          No hay turnos para este día. Los que reserven tus clientes van a aparecer acá.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-borde border-y border-borde bg-superficie">
          {turnos.map((t) => {
            const cerrado = t.estado !== "confirmado" && t.estado !== "pendiente";
            const recordatorio = `Hola ${t.cliente.split(" ")[0]}! Te recordamos tu turno de ${t.servicio.toLowerCase()} ${cuando} a las ${t.hora} hs en ${NEGOCIO.nombre}.`;
            return (
              <li key={t.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-stretch gap-3 px-5 py-3 active:bg-acento-suave [&::-webkit-details-marker]:hidden">
                    <div className="w-12 shrink-0">
                      <p className="text-lg font-bold tabular-nums">{t.hora}</p>
                      <p className="text-xs text-suave tabular-nums">{t.hora_fin}</p>
                    </div>
                    <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                    <div className={`min-w-0 flex-1 ${t.estado === "cancelado" ? "opacity-50" : ""}`}>
                      <p className={`truncate text-lg font-semibold ${t.estado === "cancelado" ? "line-through" : ""}`}>
                        {t.cliente}
                      </p>
                      <p className="truncate text-sm text-suave">
                        {t.servicio}, con {t.profesional}
                      </p>
                    </div>
                    <span className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${ESTILO[t.estado]}`}>
                      {ETIQUETA[t.estado]}
                    </span>
                  </summary>

                  <div className="space-y-3 pb-4 pl-[5.25rem] pr-5">
                    <p className="text-sm text-suave">
                      {pesos.format(Number(t.precio))}, celular {t.telefono}
                    </p>
                    {t.notas && <p className="rounded-xl bg-fondo px-3 py-2 text-sm">{t.notas}</p>}
                    <div className="flex gap-2">
                      <a
                        href={linkWhatsApp(t.telefono, recordatorio)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-10 items-center rounded-xl bg-acento px-4 text-sm font-semibold text-sobre-acento"
                      >
                        Recordar por WhatsApp
                      </a>
                      <a
                        href={`tel:${t.telefono}`}
                        className="flex h-10 items-center rounded-xl border border-borde bg-superficie px-4 text-sm font-semibold"
                      >
                        Llamar
                      </a>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cerrado ? (
                        <BotonEstado id={t.id} estado="confirmado" texto="Volver a confirmado" />
                      ) : (
                        <>
                          <BotonEstado id={t.id} estado="completado" texto="Atendido" />
                          <BotonEstado id={t.id} estado="ausente" texto="No vino" />
                          <BotonEstado
                            id={t.id}
                            estado="cancelado"
                            texto="Cancelar turno"
                            confirmar={`¿Cancelar el turno de ${t.cliente} a las ${t.hora}? El horario queda libre para otra reserva.`}
                            peligro
                          />
                        </>
                      )}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href={`/admin/nuevo?fecha=${fecha}`}
        aria-label="Cargar turno"
        className="fixed right-5 grid size-16 place-items-center rounded-full bg-acento text-4xl font-light leading-none text-sobre-acento shadow-lg shadow-acento/25 active:scale-95"
        style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        +
      </Link>
    </main>
  );
}
