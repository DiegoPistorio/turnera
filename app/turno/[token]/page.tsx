import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { NEGOCIO } from "@/lib/config";
import { Marca } from "@/components/Marca";
import { reconciliarTurno } from "@/lib/pagos";
import { Actualizar } from "./Actualizar";
import { BotonCancelar } from "./BotonCancelar";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TZ = NEGOCIO.zonaHoraria;
const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

type Turno = {
  estado: string;
  inicio: Date;
  vence_en: Date | null;
  precio: string;
  sena: string;
  sena_pagada: boolean;
  cancelado_por: "cliente" | "barberia" | null;
  devolucion: "pendiente" | "hecho" | "error" | null;
  puede_cancelar: boolean;
  servicio: string;
  profesional: string;
};

// Un pendiente con el plazo cumplido se muestra como vencido aunque todavía no se haya marcado
async function buscarTurno(token: string) {
  const [t] = await query<Turno>(
    `SELECT CASE WHEN t.estado = 'pendiente' AND t.vence_en < now() THEN 'vencido' ELSE t.estado::text END AS estado,
            t.inicio, t.vence_en, t.precio, t.sena, t.cancelado_por,
            EXISTS (SELECT 1 FROM pagos g
                     WHERE g.turno_id = t.id AND g.estado = 'approved' AND g.reembolso_estado IS NULL) AS sena_pagada,
            (SELECT CASE WHEN bool_or(g.reembolso_estado = 'hecho') THEN 'hecho'
                         WHEN bool_or(g.reembolso_estado IN ('pendiente', 'error')) THEN 'pendiente' END
               FROM pagos g WHERE g.turno_id = t.id) AS devolucion,
            t.inicio - now() >= make_interval(hours => $2::int) AS puede_cancelar,
            s.nombre AS servicio, p.nombre AS profesional
       FROM turnos t
       JOIN servicios s     ON s.id = t.servicio_id
       JOIN profesionales p ON p.id = t.profesional_id
      WHERE t.token = $1`,
    [token, NEGOCIO.sena.horasMinimasCancelacion]
  );
  return t;
}

const hora = (d: Date) =>
  d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const fechaLarga = (d: Date) =>
  d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });

// /turno/<token>: el "Mi turno" del cliente, sin login. Mercado Pago vuelve acá después del pago.
export default async function TurnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string; collection_status?: string; payment_id?: string; error?: string }>;
}) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();
  const sp = await searchParams;
  const estadoPago = sp.collection_status ?? sp.status; // lo agrega Mercado Pago al volver

  let t = await buscarTurno(token);
  if (!t) notFound();

  // Si todavía figura sin pagar, le preguntamos a Mercado Pago por si el webhook no llegó o se demora
  if (t.estado === "pendiente" || (t.estado === "vencido" && sp.payment_id)) {
    try {
      await reconciliarTurno(token, sp.payment_id);
      t = (await buscarTurno(token)) ?? t;
    } catch (e) {
      console.error("No se pudo consultar el pago en Mercado Pago:", e);
    }
  }

  const saldo = Math.max(Number(t.precio) - Number(t.sena), 0);
  const cuando = `${fechaLarga(t.inicio)} a las ${hora(t.inicio)} hs`;

  const detalle = (
    <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-y border-borde py-4">
      <dt className="text-suave">Servicio</dt>
      <dd className="text-right font-semibold">{t.servicio}</dd>
      <dt className="text-suave">Te atiende</dt>
      <dd className="text-right font-semibold">{t.profesional}</dd>
      <dt className="text-suave">Cuándo</dt>
      <dd className="text-right font-semibold first-letter:uppercase">{cuando}</dd>
      <dt className="text-suave">Precio</dt>
      <dd className="text-right font-semibold tabular-nums">{pesos.format(Number(t.precio))}</dd>
      {Number(t.sena) > 0 && (
        <>
          <dt className="text-suave">Seña</dt>
          <dd className="text-right font-semibold tabular-nums">{pesos.format(Number(t.sena))}</dd>
          <dt className="text-suave">Resto en la barbería</dt>
          <dd className="text-right font-semibold tabular-nums">{pesos.format(saldo)}</dd>
        </>
      )}
    </dl>
  );

  let contenido: React.ReactNode;

  if (t.estado === "pendiente") {
    const verificando = estadoPago === "approved";
    contenido = (
      <>
        {/* Sigue consultando hasta que el webhook confirme el pago o venza el plazo */}
        <Actualizar cadaSegundos={verificando ? 3 : 10} />
        <Icono>…</Icono>
        <h1 className="mt-6 text-4xl font-titulo font-bold tracking-tight">
          {verificando ? "Confirmando tu pago" : "Falta pagar la seña"}
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-suave">
          {verificando ? (
            "Mercado Pago nos está avisando del pago. Esto tarda unos segundos; no cierres esta página."
          ) : (
            <>
              Tu horario está reservado hasta las{" "}
              <strong className="text-texto">{t.vence_en ? hora(t.vence_en) : ""} hs</strong>. Si no se paga la seña
              antes, se libera.
            </>
          )}
        </p>
        {(estadoPago === "rejected" || sp.error === "pago") && (
          <p role="alert" className="mt-4 rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro">
            {sp.error === "pago"
              ? "No pudimos abrir Mercado Pago. Probá de nuevo."
              : "El pago no se aprobó. Podés intentarlo de nuevo con otro medio."}
          </p>
        )}
        {detalle}
        {!verificando && (
          <div className="mt-auto space-y-3 pt-10">
            <a
              href={`/turno/${token}/pagar`}
              className="flex h-14 items-center justify-center rounded-2xl bg-acento text-lg font-semibold text-sobre-acento"
            >
              Pagar seña {pesos.format(Number(t.sena))}
            </a>
          </div>
        )}
      </>
    );
  } else if (t.estado === "confirmado") {
    const texto = `Turno en ${NEGOCIO.nombre}: ${t.servicio} con ${t.profesional}, el ${cuando}.`;
    contenido = (
      <>
        <Icono>✓</Icono>
        <h1 className="mt-6 text-4xl font-titulo font-bold tracking-tight">Turno confirmado</h1>
        <p className="mt-3 text-lg leading-relaxed text-suave">
          Te esperamos el <strong className="text-texto">{cuando}</strong>.
        </p>
        {detalle}
        <p className="mt-4 text-sm text-suave">Guardá esta página: es tu comprobante del turno.</p>
        <div className="mt-auto space-y-3 pt-10">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-14 items-center justify-center rounded-2xl bg-acento text-lg font-semibold text-sobre-acento"
          >
            Compartir por WhatsApp
          </a>
          <OtroTurno />
          {t.puede_cancelar ? (
            <BotonCancelar token={token} sena={t.sena_pagada ? pesos.format(Number(t.sena)) : null} />
          ) : (
            <p className="text-center text-sm text-suave">
              Para cancelar con menos de {NEGOCIO.sena.horasMinimasCancelacion} hs de anticipación, escribile a la
              barbería.
            </p>
          )}
        </div>
      </>
    );
  } else {
    const titulo: Record<string, [string, string]> = {
      vencido: ["Se venció el plazo", `No se pagó la seña a tiempo y el horario se liberó. Podés sacar un turno nuevo.`],
      cancelado: ["Turno cancelado", textoCancelado(t)],
      completado: ["¡Gracias por venir!", "Este turno ya fue atendido."],
      ausente: ["Turno no asistido", "Este turno quedó registrado como ausente."],
    };
    const [h, p] = titulo[t.estado] ?? ["Turno", ""];
    contenido = (
      <>
        <Icono>{t.estado === "completado" ? "✓" : "×"}</Icono>
        <h1 className="mt-6 text-4xl font-titulo font-bold tracking-tight">{h}</h1>
        <p className="mt-3 text-lg leading-relaxed text-suave">{p}</p>
        {detalle}
        <div className="mt-auto space-y-3 pt-10">
          <OtroTurno principal />
        </div>
      </>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col px-5"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mb-8 flex h-10 items-center">
        <Marca />
      </div>
      {contenido}
    </main>
  );
}

function textoCancelado(t: Turno) {
  const sena = pesos.format(Number(t.sena));
  if (t.devolucion === "hecho") {
    return `${NEGOCIO.nombre} canceló el turno y te devolvió la seña de ${sena}. Según el medio de pago, puede tardar unos días en verse.`;
  }
  if (t.devolucion === "pendiente") return `${NEGOCIO.nombre} canceló el turno. Te estamos devolviendo la seña de ${sena}.`;
  if (t.cancelado_por === "cliente") {
    return t.sena_pagada ? `Cancelaste este turno. La seña de ${sena} no se devuelve.` : "Cancelaste este turno.";
  }
  return "Este turno fue cancelado.";
}

function Icono({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid size-16 place-items-center rounded-full bg-acento text-3xl text-sobre-acento">{children}</div>
  );
}

function OtroTurno({ principal = false }: { principal?: boolean }) {
  return (
    <Link
      href="/reservar"
      className={`flex h-14 items-center justify-center rounded-2xl text-lg font-semibold ${
        principal ? "bg-acento text-sobre-acento" : "border border-borde bg-superficie"
      }`}
    >
      Sacar otro turno
    </Link>
  );
}
