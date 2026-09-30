"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarCliente, crearTurno } from "../acciones";

export type Servicio = { id: number; nombre: string; duracion_min: number; precio: string };
export type Profesional = { id: number; nombre: string; color: string; servicios: number[] };
type Slot = { inicio: string; hora: string };

const campo =
  "mt-1.5 h-13 w-full rounded-xl border border-linea bg-white px-4 text-lg outline-none focus:border-ciruela focus:ring-2 focus:ring-ciruela/20";

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
        activa ? "border-ciruela bg-ciruela text-white" : "border-linea bg-white active:bg-ciruela-suave"
      }`}
    >
      {children}
    </button>
  );
}

export function NuevoTurnoForm({
  servicios,
  profesionales,
  fechaInicial,
}: {
  servicios: Servicio[];
  profesionales: Profesional[];
  fechaInicial: string;
}) {
  const router = useRouter();
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [conocido, setConocido] = useState<{ nombre: string; turnos: number } | null>(null);
  const [servicioId, setServicioId] = useState<number | null>(null);
  const [profesionalId, setProfesionalId] = useState<number | null>(
    profesionales.length === 1 ? profesionales[0].id : null
  );
  const [fecha, setFecha] = useState(fechaInicial);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  const disponibles = profesionales.filter((p) => servicioId === null || p.servicios.includes(servicioId));

  // Si el celular ya está cargado, completa el nombre
  useEffect(() => {
    const digitos = telefono.replace(/\D/g, "");
    if (digitos.length < 8) {
      setConocido(null);
      return;
    }
    let cancelado = false;
    const espera = setTimeout(async () => {
      const c = await buscarCliente(digitos);
      if (cancelado) return;
      setConocido(c);
      if (c) setNombre((actual) => actual || c.nombre);
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [telefono]);

  // Horarios libres para la combinación elegida
  useEffect(() => {
    if (!servicioId || !profesionalId || manual) return;
    let cancelado = false;
    setSlots(null);
    fetch(`/api/disponibilidad?profesional=${profesionalId}&servicio=${servicioId}&fecha=${fecha}`)
      .then((r) => r.json())
      .then((d) => !cancelado && setSlots(d.slots ?? []))
      .catch(() => !cancelado && setSlots([]));
    return () => {
      cancelado = true;
    };
  }, [servicioId, profesionalId, fecha, manual]);

  function elegirServicio(id: number) {
    setServicioId(id);
    setHora(null);
    const sigue = profesionales.find((p) => p.id === profesionalId)?.servicios.includes(id);
    if (!sigue && profesionales.length > 1) setProfesionalId(null);
  }

  function guardar() {
    setError(null);
    if (!servicioId || !profesionalId || !hora) {
      setError("Elegí servicio, profesional y horario.");
      return;
    }
    iniciar(async () => {
      const r = await crearTurno({ telefono, nombre, servicioId, profesionalId, fecha, hora, notas });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.push(`/admin?fecha=${fecha}`);
    });
  }

  return (
    <div className="space-y-8 px-5 pb-36 pt-4">
      <section>
        <h2 className="text-lg font-semibold">Cliente</h2>
        <label className="mt-3 block">
          <span className="text-sm font-medium">Celular</span>
          <input
            type="tel"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="11 2345 6789"
            className={`${campo} placeholder:text-gris/50`}
          />
        </label>
        {conocido && (
          <p className="mt-2 text-sm text-ciruela">
            Ya es cliente{conocido.turnos > 0 ? `, vino ${conocido.turnos === 1 ? "1 vez" : `${conocido.turnos} veces`}` : ""}.
          </p>
        )}
        <label className="mt-4 block">
          <span className="text-sm font-medium">Nombre y apellido</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
        </label>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Servicio</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {servicios.map((s) => (
            <Opcion key={s.id} activa={servicioId === s.id} onClick={() => elegirServicio(s.id)}>
              <span className="block font-semibold leading-tight">{s.nombre}</span>
              <span className="text-sm opacity-75">{s.duracion_min} min</span>
            </Opcion>
          ))}
        </div>
      </section>

      {profesionales.length > 1 && (
        <section>
          <h2 className="text-lg font-semibold">Profesional</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {disponibles.map((p) => (
              <Opcion
                key={p.id}
                activa={profesionalId === p.id}
                onClick={() => {
                  setProfesionalId(p.id);
                  setHora(null);
                }}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <span className="size-3 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.nombre}
                </span>
              </Opcion>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">Día y horario</h2>
        <input
          type="date"
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
            setHora(null);
          }}
          className={campo}
        />

        <div className="mt-4 flex gap-2">
          <Opcion
            activa={!manual}
            onClick={() => {
              setManual(false);
              setHora(null);
            }}
          >
            Horarios libres
          </Opcion>
          <Opcion
            activa={manual}
            onClick={() => {
              setManual(true);
              setHora(null);
            }}
          >
            Otra hora
          </Opcion>
        </div>

        {manual ? (
          <label className="mt-4 block">
            <span className="text-sm font-medium">Hora de inicio</span>
            <input
              type="time"
              step={900}
              value={hora ?? ""}
              onChange={(e) => setHora(e.target.value || null)}
              className={campo}
            />
          </label>
        ) : !servicioId || !profesionalId ? (
          <p className="mt-4 text-sm text-gris">Elegí servicio y profesional para ver los horarios libres.</p>
        ) : slots === null ? (
          <p className="mt-4 text-sm text-gris">Buscando horarios…</p>
        ) : slots.length === 0 ? (
          <p className="mt-4 text-sm text-gris">No quedan horarios libres ese día. Probá con otro día o con Otra hora.</p>
        ) : (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <button
                key={s.inicio}
                type="button"
                onClick={() => setHora(s.hora)}
                aria-pressed={hora === s.hora}
                className={`h-11 rounded-xl border font-semibold tabular-nums ${
                  hora === s.hora ? "border-ciruela bg-ciruela text-white" : "border-linea bg-white"
                }`}
              >
                {s.hora}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <label className="block">
          <span className="text-lg font-semibold">Notas</span>
          <span className="ml-2 text-sm text-gris">opcional</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            placeholder="Por ejemplo: trae foto del color que quiere"
            className="mt-3 w-full rounded-xl border border-linea bg-white px-4 py-3 text-lg outline-none placeholder:text-gris/50 focus:border-ciruela focus:ring-2 focus:ring-ciruela/20"
          />
        </label>
      </section>

      <div
        className="fixed inset-x-0 bottom-0 border-t border-linea bg-papel/95 px-5 pt-3 backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-2xl">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {error}
            </p>
          )}
          <button
            onClick={guardar}
            disabled={guardando}
            className="h-14 w-full rounded-2xl bg-ciruela text-lg font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {guardando ? "Guardando…" : hora ? `Guardar turno de las ${hora}` : "Guardar turno"}
          </button>
        </div>
      </div>
    </div>
  );
}
