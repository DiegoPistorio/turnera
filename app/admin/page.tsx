import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";
import { linkWhatsApp } from "@/lib/telefono";
import { BotonEstado } from "./BotonEstado";
import { BotonCancelar } from "./BotonCancelar";
import { BotonReintentar } from "./BotonReintentar";

type TurnoAgenda = {
  id: number;
  hora: string;
  hora_fin: string;
  vence: string | null; // HH:MM hasta la que se puede pagar la seña, solo en pendientes
  estado: string;
  precio: string;
  notas: string | null;
  sena: string;
  sena_pagada: boolean;
  devolucion: "pendiente" | "hecho" | "error" | null;
  cancelado_por: "cliente" | "barberia" | null;
  cliente: string;
  telefono: string;
  servicio: string;
  profesional: string;
  color: string;
};

const TZ = NEGOCIO.zonaHoraria;
const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const ETIQUETA: Record<string, string> = {
  pendiente: "Esperando pago",
  confirmado: "Confirmado",
  completado: "Atendido",
  ausente: "No vino",
  cancelado: "Cancelado",
  vencido: "Sin pagar",
};
const ESTILO: Record<string, string> = {
  pendiente: "bg-amber-400/15 text-amber-300",
  confirmado: "bg-acento-suave text-acento",
  completado: "bg-emerald-400/15 text-emerald-300",
  ausente: "bg-orange-400/15 text-orange-300",
  cancelado: "bg-borde text-suave",
  vencido: "bg-borde text-suave",
};

const SQL = `
  SELECT t.id, t.estado, t.precio, t.notas, t.sena, t.cancelado_por,
         EXISTS (SELECT 1 FROM pagos g
                  WHERE g.turno_id = t.id AND g.estado = 'approved' AND g.reembolso_estado IS NULL) AS sena_pagada,
         (SELECT CASE WHEN bool_or(g.reembolso_estado = 'error') THEN 'error'
                      WHEN bool_or(g.reembolso_estado = 'pendiente') THEN 'pendiente'
                      WHEN bool_or(g.reembolso_estado = 'hecho') THEN 'hecho' END
            FROM pagos g WHERE g.turno_id = t.id) AS devolucion,
         to_char(t.inicio AT TIME ZONE $2, 'HH24:MI') AS hora,
         to_char(t.fin    AT TIME ZONE $2, 'HH24:MI') AS hora_fin,
         CASE WHEN t.estado = 'pendiente' THEN to_char(t.vence_en AT TIME ZONE $2, 'HH24:MI') END AS vence,
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

// Devoluciones de seña que Mercado Pago rechazó, de cualquier día: quedan a la vista hasta que salgan.
// Incluye turnos vencidos (pagó tarde con el horario ocupado), que la agenda no muestra.
type DevolucionFallida = {
  turno_id: number;
  fecha: string;
  hora: string;
  cliente: string;
  monto: string;
  error: string | null;
};
const SQL_DEVOLUCIONES = `
  SELECT t.id AS turno_id,
         to_char(t.inicio AT TIME ZONE $1, 'DD/MM') AS fecha,
         to_char(t.inicio AT TIME ZONE $1, 'HH24:MI') AS hora,
         c.nombre AS cliente, sum(g.monto) AS monto, max(g.reembolso_error) AS error
    FROM pagos g
    JOIN turnos t        ON t.id = g.turno_id
    JOIN clientes c      ON c.id = t.cliente_id
    JOIN profesionales p ON p.id = t.profesional_id
   WHERE g.reembolso_estado = 'error'
     AND ($2::int IS NULL OR p.usuario_id = $2)
   GROUP BY t.id, c.nombre
   ORDER BY t.inicio`;

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
  const [turnos, devoluciones] = await Promise.all([
    query<TurnoAgenda>(SQL, [fecha, TZ, soloUsuario]),
    query<DevolucionFallida>(SQL_DEVOLUCIONES, [TZ, soloUsuario]),
  ]);

  const activos = turnos.filter((t) => t.estado !== "cancelado");
  // Lo que se espera cobrar: el precio de los que vienen, y la seña que queda de los que faltaron o cancelaron
  const estimado = turnos.reduce((suma, t) => {
    if (t.estado === "pendiente" || t.estado === "confirmado" || t.estado === "completado") return suma + Number(t.precio);
    return suma + (t.sena_pagada ? Number(t.sena) : 0);
  }, 0);
  const enSenas = turnos.reduce((suma, t) => suma + (t.sena_pagada ? Number(t.sena) : 0), 0);

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

        {devoluciones.length > 0 && (
          <div role="alert" className="mt-5 rounded-2xl border border-peligro/40 bg-peligro-suave p-4">
            <p className="font-semibold text-peligro">
              {devoluciones.length === 1
                ? "Hay 1 seña que no se pudo devolver"
                : `Hay ${devoluciones.length} señas que no se pudieron devolver`}
            </p>
            <p className="mt-1 text-sm text-suave">
              Suele pasar si la cuenta de Mercado Pago no tiene saldo. Revisala y volvé a intentar.
            </p>
            <ul className="mt-3 space-y-3">
              {devoluciones.map((d) => (
                <li key={d.turno_id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {d.cliente}, {pesos.format(Number(d.monto))}
                    </p>
                    <p className="truncate text-sm text-suave">
                      Turno del {d.fecha} a las {d.hora}
                      {d.error && ` · ${d.error}`}
                    </p>
                  </div>
                  <BotonReintentar turnoId={d.turno_id} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-5 text-sm text-suave">
          {activos.length === 1 ? "1 turno" : `${activos.length} turnos`}
          {estimado > 0 && `, ${pesos.format(estimado)} estimado`}
          {enSenas > 0 && ` (${pesos.format(enSenas)} ya cobrado en señas)`}
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
                      <Sena t={t} />
                    </div>
                    <span className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${ESTILO[t.estado]}`}>
                      {ETIQUETA[t.estado]}
                    </span>
                  </summary>

                  <div className="space-y-3 pb-4 pl-[5.25rem] pr-5">
                    <p className="text-sm text-suave">
                      {pesos.format(Number(t.precio))}
                      {t.sena_pagada && `, ${pesos.format(Number(t.sena))} de seña`}, celular {t.telefono}
                    </p>
                    {t.notas && <p className="rounded-xl bg-fondo px-3 py-2 text-sm">{t.notas}</p>}
                    {t.estado === "cancelado" && (t.cancelado_por || t.devolucion) && (
                      <p className="text-sm text-suave">
                        {t.cancelado_por === "cliente" ? "Lo canceló el cliente" : "Lo canceló la barbería"}
                        {t.devolucion === "hecho" && `. Seña de ${pesos.format(Number(t.sena))} devuelta.`}
                        {t.devolucion === "pendiente" && ". Devolviendo la seña…"}
                        {t.devolucion === "error" && ". La devolución de la seña falló (ver arriba)."}
                        {!t.devolucion && t.sena_pagada && `. La seña de ${pesos.format(Number(t.sena))} no se devuelve.`}
                      </p>
                    )}
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
                        <BotonEstado
                          id={t.id}
                          estado="confirmado"
                          texto="Volver a confirmado"
                          confirmar={
                            t.devolucion
                              ? `A ${t.cliente} ya se le devolvió (o se le está devolviendo) la seña. Si reactivás el turno, queda confirmado sin seña y paga todo en el local. ¿Seguir?`
                              : undefined
                          }
                        />
                      ) : (
                        <>
                          <BotonEstado id={t.id} estado="completado" texto="Atendido" />
                          <BotonEstado id={t.id} estado="ausente" texto="No vino" />
                          <BotonCancelar
                            id={t.id}
                            cliente={t.cliente}
                            hora={t.hora}
                            sena={t.sena_pagada ? pesos.format(Number(t.sena)) : null}
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

// Cómo está la seña del turno, debajo del servicio. Los cargados a mano no tienen seña y no muestran nada.
function Sena({ t }: { t: TurnoAgenda }) {
  const precio = Number(t.precio);
  const saldo = Math.max(precio - Number(t.sena), 0);

  if (t.estado === "pendiente" && t.vence) {
    return <p className="text-sm font-medium text-amber-300">Esperando la seña, vence a las {t.vence}</p>;
  }
  if (t.estado !== "confirmado") return null;
  if (t.sena_pagada) {
    return <p className="text-sm font-medium text-acento">Seña pagada, cobrar {pesos.format(saldo)}</p>;
  }
  if (t.devolucion) {
    // Se reactivó después de devolverle la seña: paga todo en el local
    return <p className="text-sm font-medium text-amber-300">Seña devuelta, cobrar {pesos.format(precio)}</p>;
  }
  return null;
}
