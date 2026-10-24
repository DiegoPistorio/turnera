"use client";

import { useState, useTransition } from "react";
import { NEGOCIO } from "@/lib/config";
import { linkWhatsApp } from "@/lib/telefono";
import { crearCierre, type TurnoAfectado } from "./acciones";
import { cancelar } from "../acciones";

export type ProfesionalOpcion = { id: number; nombre: string; color: string };

const campo =
  "mt-1.5 h-13 w-full rounded-xl border border-borde bg-superficie px-4 text-lg outline-none focus:border-acento focus:ring-2 focus:ring-acento/20";

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`rounded-xl border px-4 py-2.5 text-left font-semibold transition-colors ${
        activa ? "border-acento bg-acento text-sobre-acento" : "border-borde bg-superficie active:bg-acento-suave"
      }`}
    >
      {children}
    </button>
  );
}

function fechaTexto(iso: string) {
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: NEGOCIO.zonaHoraria,
  });
}

// Lo cancela la barbería: si tenía seña, se le devuelve al cliente
function CancelarAfectado({ t }: { t: TurnoAfectado }) {
  const [estado, setEstado] = useState<"listo" | "devolucion-fallida" | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (estado) {
    return (
      <p className={`text-sm font-medium ${estado === "listo" ? "text-acento" : "text-peligro"}`}>
        {estado === "listo"
          ? t.sena_pagada
            ? "Cancelado, seña devuelta."
            : "Cancelado."
          : "Cancelado, pero la devolución falló: reintentala desde la agenda."}
      </p>
    );
  }
  return (
    <button
      disabled={pendiente}
      onClick={() => {
        const pregunta = t.sena_pagada
          ? `¿Cancelar el turno de ${t.cliente} y devolverle la seña por Mercado Pago?`
          : `¿Cancelar el turno de ${t.cliente}?`;
        if (!window.confirm(pregunta)) return;
        iniciar(async () => {
          const r = await cancelar(t.id, t.sena_pagada ? "barberia" : null);
          if (r.error) alert(r.error);
          else setEstado(r.devolucionFallida ? "devolucion-fallida" : "listo");
        });
      }}
      className="h-10 rounded-xl border border-peligro/40 bg-superficie px-3 text-sm font-semibold text-peligro active:bg-peligro-suave disabled:opacity-50"
    >
      {pendiente ? "Cancelando…" : t.sena_pagada ? "Cancelar y devolver la seña" : "Cancelar turno"}
    </button>
  );
}

export function CierreForm({
  profesionales,
  hoy,
  puedeCerrarLocal,
}: {
  profesionales: ProfesionalOpcion[];
  hoy: string;
  puedeCerrarLocal: boolean;
}) {
  // null = todo el local
  const [profesionalId, setProfesionalId] = useState<number | null>(
    puedeCerrarLocal ? null : (profesionales[0]?.id ?? null)
  );
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [diaCompleto, setDiaCompleto] = useState(true);
  const [horaDesde, setHoraDesde] = useState("15:00");
  const [horaHasta, setHoraHasta] = useState("20:00");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<{ afectados: TurnoAfectado[] } | null>(null);
  const [guardando, iniciar] = useTransition();

  function guardar() {
    setError(null);
    setGuardado(null);
    iniciar(async () => {
      const r = await crearCierre({
        profesionalId,
        desde,
        hasta: diaCompleto ? hasta : desde,
        diaCompleto,
        horaDesde,
        horaHasta,
        motivo,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setGuardado({ afectados: r.afectados ?? [] });
      setMotivo("");
    });
  }

  return (
    <section className="mt-6 space-y-6 px-5">
      <div>
        <h2 className="text-lg font-semibold">¿Quién no atiende?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {puedeCerrarLocal && (
            <Opcion activa={profesionalId === null} onClick={() => setProfesionalId(null)}>
              Todo el local
            </Opcion>
          )}
          {profesionales.map((p) => (
            <Opcion key={p.id} activa={profesionalId === p.id} onClick={() => setProfesionalId(p.id)}>
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ backgroundColor: p.color }} />
                {p.nombre}
              </span>
            </Opcion>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">¿Cuánto tiempo?</h2>
        <div className="mt-3 flex gap-2">
          <Opcion activa={diaCompleto} onClick={() => setDiaCompleto(true)}>
            Días completos
          </Opcion>
          <Opcion activa={!diaCompleto} onClick={() => setDiaCompleto(false)}>
            Solo unas horas
          </Opcion>
        </div>

        {diaCompleto ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Desde</span>
              <input
                type="date"
                value={desde}
                min={hoy}
                onChange={(e) => {
                  setDesde(e.target.value);
                  if (e.target.value > hasta) setHasta(e.target.value);
                }}
                className={campo}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Hasta</span>
              <input
                type="date"
                value={hasta}
                min={desde}
                onChange={(e) => setHasta(e.target.value)}
                className={campo}
              />
            </label>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Día</span>
              <input type="date" value={desde} min={hoy} onChange={(e) => setDesde(e.target.value)} className={campo} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">De</span>
                <input
                  type="time"
                  step={900}
                  value={horaDesde}
                  onChange={(e) => setHoraDesde(e.target.value)}
                  className={campo}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">A</span>
                <input
                  type="time"
                  step={900}
                  value={horaHasta}
                  onChange={(e) => setHoraHasta(e.target.value)}
                  className={campo}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <label className="block">
        <span className="text-lg font-semibold">Motivo</span>
        <span className="ml-2 text-sm text-suave">opcional</span>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Feriado, vacaciones, capacitación…"
          className={`${campo} placeholder:text-suave/50`}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro">
          {error}
        </p>
      )}

      <button
        onClick={guardar}
        disabled={guardando}
        className="h-14 w-full rounded-2xl bg-acento text-lg font-semibold text-sobre-acento transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {guardando ? "Guardando…" : "Guardar cierre"}
      </button>

      {guardado && guardado.afectados.length === 0 && (
        <p className="rounded-xl bg-acento-suave px-4 py-3 text-sm font-medium text-acento">
          Listo. Esos horarios ya no aparecen en la reserva.
        </p>
      )}

      {guardado && guardado.afectados.length > 0 && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
          <p className="font-semibold text-amber-300">
            Cierre guardado, pero{" "}
            {guardado.afectados.length === 1
              ? "hay 1 turno reservado"
              : `hay ${guardado.afectados.length} turnos reservados`}{" "}
            en ese período.
          </p>
          <p className="mt-1 text-sm text-suave">
            No se cancelaron. Avisale a cada cliente y cancelá o reprogramá cada turno. Si tenía seña, al cancelarlo
            acá se le devuelve.
          </p>
          <ul className="mt-3 space-y-3">
            {guardado.afectados.map((t) => {
              const mensaje = `Hola ${t.cliente.split(" ")[0]}! Te escribimos de ${NEGOCIO.nombre}: el ${fechaTexto(t.fecha)} no vamos a poder atenderte a las ${t.hora} hs. ¿Querés que reprogramemos tu turno?`;
              return (
                <li key={t.id} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.cliente}</p>
                      <p className="truncate text-sm text-suave first-letter:uppercase">
                        {fechaTexto(t.fecha)}, {t.hora} hs · {t.servicio} con {t.profesional}
                      </p>
                    </div>
                    <a
                      href={linkWhatsApp(t.telefono, mensaje)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-10 shrink-0 items-center rounded-xl bg-acento px-3 text-sm font-semibold text-sobre-acento"
                    >
                      Avisar
                    </a>
                  </div>
                  <CancelarAfectado t={t} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
