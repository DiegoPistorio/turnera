"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { borrarServicio, guardarServicio } from "../acciones";

export type ServicioInicial = {
  id: number | null;
  nombre: string;
  descripcion: string;
  duracionMin: number;
  precio: string;
  activo: boolean;
  profesionales: number[];
  turnos: number;
};

const DURACIONES = [15, 30, 45, 60, 75, 90, 120, 150, 180];

const campo =
  "mt-1.5 h-13 w-full rounded-xl border border-borde bg-superficie px-4 text-lg outline-none focus:border-acento focus:ring-2 focus:ring-acento/20";

function textoDuracion(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto}` : `${h} h`;
}

export function ServicioForm({
  inicial,
  profesionales,
}: {
  inicial: ServicioInicial;
  profesionales: { id: number; nombre: string; color: string }[];
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial.nombre);
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [duracionMin, setDuracionMin] = useState(inicial.duracionMin);
  const [precio, setPrecio] = useState(inicial.precio);
  const [activo, setActivo] = useState(inicial.activo);
  const [elegidos, setElegidos] = useState<number[]>(inicial.profesionales);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const duraciones = DURACIONES.includes(duracionMin)
    ? DURACIONES
    : [...DURACIONES, duracionMin].sort((a, b) => a - b);

  function alternar(id: number) {
    setElegidos((lista) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]));
  }

  function guardar() {
    setError(null);
    const monto = Number(precio.replace(/\./g, "").replace(",", "."));
    iniciar(async () => {
      const r = await guardarServicio({
        id: inicial.id,
        nombre,
        descripcion,
        duracionMin,
        precio: monto,
        activo,
        profesionales: elegidos,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.push("/admin/servicios");
      router.refresh();
    });
  }

  function borrar() {
    if (inicial.id === null) return;
    const id = inicial.id;
    const aviso =
      inicial.turnos > 0
        ? `Este servicio tiene ${inicial.turnos} turnos en el historial, así que no se borra: se pausa y deja de aparecer en la reserva. ¿Continuar?`
        : `¿Borrar "${inicial.nombre}"? No se puede deshacer.`;
    if (!window.confirm(aviso)) return;
    iniciar(async () => {
      const r = await borrarServicio(id);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.push("/admin/servicios");
      router.refresh();
    });
  }

  return (
    <div className="space-y-7 px-5 pb-40 pt-4">
      <label className="block">
        <span className="text-sm font-medium">Nombre</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Corte y barba"
          className={`${campo} placeholder:text-suave/50`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Descripción</span>
        <span className="ml-2 text-sm text-suave">opcional, la ve el cliente</span>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej: Corte con lavado y perfilado"
          className={`${campo} placeholder:text-suave/50`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Precio</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 mt-[3px] -translate-y-1/2 text-lg text-suave">
            $
          </span>
          <input
            value={precio}
            onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="numeric"
            placeholder="12000"
            className={`${campo} pl-9 tabular-nums placeholder:text-suave/50`}
          />
        </div>
      </label>

      <div>
        <span className="text-sm font-medium">Duración</span>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {duraciones.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setDuracionMin(m)}
              aria-pressed={duracionMin === m}
              className={`h-11 rounded-xl border font-semibold ${
                duracionMin === m ? "border-acento bg-acento text-sobre-acento" : "border-borde bg-superficie"
              }`}
            >
              {textoDuracion(m)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-sm font-medium">¿Quién lo hace?</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {profesionales.map((p) => {
            const activoP = elegidos.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => alternar(p.id)}
                aria-pressed={activoP}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 font-semibold ${
                  activoP ? "border-acento bg-acento text-sobre-acento" : "border-borde bg-superficie"
                }`}
              >
                <span className="size-3 rounded-full" style={{ backgroundColor: p.color }} />
                {p.nombre}
                {activoP && <span aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-2xl border border-borde bg-superficie px-4 py-3">
        <span>
          <span className="block font-semibold">Disponible para reservar</span>
          <span className="text-sm text-suave">Si lo pausás, deja de aparecer para los clientes.</span>
        </span>
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          className="size-6 shrink-0 accent-[var(--color-acento)]"
        />
      </label>

      {inicial.id !== null && (
        <button
          type="button"
          onClick={borrar}
          disabled={pendiente}
          className="h-12 w-full rounded-2xl border border-peligro/40 bg-superficie font-semibold text-peligro active:bg-peligro-suave disabled:opacity-50"
        >
          {inicial.turnos > 0 ? "Quitar servicio (se pausa)" : "Borrar servicio"}
        </button>
      )}

      <div
        className="fixed inset-x-0 bottom-0 border-t border-borde bg-fondo/95 px-5 pt-3 backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-2xl">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro">
              {error}
            </p>
          )}
          <button
            onClick={guardar}
            disabled={pendiente}
            className="h-14 w-full rounded-2xl bg-acento text-lg font-semibold text-sobre-acento transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
