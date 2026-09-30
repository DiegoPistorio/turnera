"use client";

import { useEffect, useState } from "react";
import { NEGOCIO } from "@/lib/config";
import { Marca } from "@/components/Marca";

type Servicio = {
  id: number;
  nombre: string;
  descripcion: string | null;
  duracion_min: number;
  precio: string;
};
type Profesional = { id: number; nombre: string; color: string };
type Slot = { inicio: string; hora: string };
type Confirmado = {
  token: string;
  servicio: string;
  profesional: string;
  precio: string;
  hora: string;
  fechaTexto: string;
};

const TZ = NEGOCIO.zonaHoraria;
const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const TITULOS = ["¿Qué te hacés?", "¿Con quién?", "¿Cuándo?", "Último paso"];
const CUALQUIERA: Profesional = { id: 0, nombre: "El primero disponible", color: "" };

function proximosDias(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    const etiqueta =
      i === 0
        ? "Hoy"
        : i === 1
          ? "Mañana"
          : d.toLocaleDateString("es-AR", { weekday: "short", timeZone: TZ }).replace(".", "");
    return {
      iso: d.toLocaleDateString("en-CA", { timeZone: TZ }),
      etiqueta,
      numero: d.toLocaleDateString("es-AR", { day: "numeric", timeZone: TZ }),
    };
  });
}

function fechaLarga(iso: string) {
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });
}

export default function ReservarPage() {
  const [paso, setPaso] = useState(0);
  const [dias] = useState(() => proximosDias(NEGOCIO.diasVisibles));

  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [profesionales, setProfesionales] = useState<Profesional[] | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);

  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [profesional, setProfesional] = useState<Profesional | null>(null);
  const [fecha, setFecha] = useState(dias[0].iso);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<Confirmado | null>(null);

  useEffect(() => {
    fetch("/api/servicios")
      .then((r) => r.json())
      .then((d) => setServicios(d.servicios ?? []))
      .catch(() => setServicios([]));
  }, []);

  useEffect(() => {
    if (!servicio) return;
    setProfesionales(null);
    fetch(`/api/profesionales?servicio=${servicio.id}`)
      .then((r) => r.json())
      .then((d) => setProfesionales(d.profesionales ?? []))
      .catch(() => setProfesionales([]));
  }, [servicio]);

  useEffect(() => {
    if (!servicio || !profesional || paso !== 2) return;
    let cancelado = false;
    setSlots(null);
    fetch(`/api/disponibilidad?profesional=${profesional.id}&servicio=${servicio.id}&fecha=${fecha}`)
      .then((r) => r.json())
      .then((d) => !cancelado && setSlots(d.slots ?? []))
      .catch(() => !cancelado && setSlots([]));
    return () => {
      cancelado = true;
    };
  }, [servicio, profesional, fecha, paso]);

  function volver() {
    setError(null);
    if (paso === 3) setSlot(null);
    setPaso((p) => p - 1);
  }

  function reiniciar() {
    setConfirmado(null);
    setServicio(null);
    setProfesional(null);
    setSlot(null);
    setFecha(dias[0].iso);
    setError(null);
    setPaso(0);
  }

  async function confirmar() {
    if (!servicio || !profesional || !slot) return;
    setError(null);
    if (nombre.trim().length < 2) return setError("Ingresá tu nombre.");
    if (telefono.replace(/\D/g, "").length < 8) {
      return setError("Ingresá tu celular con característica, por ejemplo 11 2345 6789.");
    }

    setEnviando(true);
    try {
      const r = await fetch("/api/turnos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicioId: servicio.id,
          profesionalId: profesional.id,
          inicio: slot.inicio,
          nombre,
          telefono,
        }),
      });
      const d = await r.json();
      if (r.status === 409) {
        setError(d.error);
        setSlot(null);
        setPaso(2);
        return;
      }
      if (!r.ok) {
        setError(d.error ?? "No se pudo reservar el turno. Probá de nuevo.");
        return;
      }
      setConfirmado({ ...d, fechaTexto: fechaLarga(fecha) });
    } catch {
      setError("No hay conexión. Revisá tu internet y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (confirmado) return <Confirmacion c={confirmado} onOtro={reiniciar} />;

  const manana = slots?.filter((s) => s.hora < "13:00") ?? [];
  const tarde = slots?.filter((s) => s.hora >= "13:00") ?? [];

  return (
    <main className="mx-auto min-h-dvh max-w-md pb-36">
      <header
        className="sticky top-0 z-10 bg-fondo/95 px-5 pb-4 backdrop-blur"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="flex h-10 items-center gap-2">
          {paso > 0 && (
            <button
              onClick={volver}
              aria-label="Volver"
              className="-ml-3 grid size-10 place-items-center rounded-full text-3xl leading-none active:bg-acento-suave"
            >
              ‹
            </button>
          )}
          <Marca />
        </div>
        <h1 className="mt-1 text-[2rem] font-titulo font-bold leading-tight tracking-tight">{TITULOS[paso]}</h1>
        <div className="mt-4 flex gap-1.5" role="progressbar" aria-valuenow={paso + 1} aria-valuemin={1} aria-valuemax={4}>
          {TITULOS.map((t, i) => (
            <span key={t} className={`h-1.5 flex-1 rounded-full ${i <= paso ? "poste" : "bg-borde"}`} />
          ))}
        </div>
      </header>

      {error && paso === 2 && <Aviso texto={error} />}

      {/* Paso 1: servicio */}
      {paso === 0 &&
        (servicios === null ? (
          <Cargando />
        ) : servicios.length === 0 ? (
          <Vacio texto="Todavía no hay servicios para reservar." />
        ) : (
          <ul className="divide-y divide-borde border-y border-borde bg-superficie">
            {servicios.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    setServicio(s);
                    setProfesional(null);
                    setSlot(null);
                    setPaso(1);
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left active:bg-acento-suave"
                >
                  <div className="flex-1">
                    <p className="text-lg font-semibold">{s.nombre}</p>
                    <p className="text-sm text-suave">
                      {s.duracion_min} min{s.descripcion ? `, ${s.descripcion.toLowerCase()}` : ""}
                    </p>
                  </div>
                  <span className="text-lg font-semibold tabular-nums">{pesos.format(Number(s.precio))}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {/* Paso 2: profesional */}
      {paso === 1 &&
        (profesionales === null ? (
          <Cargando />
        ) : profesionales.length === 0 ? (
          <Vacio texto="Nadie hace este servicio por ahora. Elegí otro." />
        ) : (
          <ul className="divide-y divide-borde border-y border-borde bg-superficie">
            {[CUALQUIERA, ...profesionales].map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setProfesional(p);
                    setSlot(null);
                    setError(null);
                    setPaso(2);
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left active:bg-acento-suave"
                >
                  {p.id === 0 ? (
                    <span className="grid size-12 place-items-center rounded-full border-2 border-dashed border-acento text-xl text-acento">
                      ?
                    </span>
                  ) : (
                    <span
                      className="grid size-12 place-items-center rounded-full text-xl font-bold text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.nombre[0]}
                    </span>
                  )}
                  <div>
                    <p className="text-lg font-semibold">{p.nombre}</p>
                    {p.id === 0 && <p className="text-sm text-suave">Te mostramos todos los horarios libres</p>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {/* Paso 3: día y horario */}
      {paso === 2 && (
        <section>
          <div className="sin-scrollbar flex snap-x gap-2 overflow-x-auto px-5 pb-1">
            {dias.map((d) => {
              const activo = d.iso === fecha;
              return (
                <button
                  key={d.iso}
                  onClick={() => {
                    setFecha(d.iso);
                    setError(null);
                  }}
                  aria-pressed={activo}
                  className={`flex w-16 shrink-0 snap-start flex-col items-center rounded-2xl border py-2.5 transition-colors ${
                    activo ? "border-acento bg-acento text-sobre-acento" : "border-borde bg-superficie"
                  }`}
                >
                  <span className="text-xs first-letter:uppercase">{d.etiqueta}</span>
                  <span className="text-xl font-bold tabular-nums">{d.numero}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-5 px-5 text-sm text-suave first-letter:uppercase">
            {fechaLarga(fecha)}, {servicio?.nombre.toLowerCase()} con{" "}
            {profesional?.id === 0 ? "quien esté libre" : profesional?.nombre}
          </p>

          {slots === null ? (
            <Cargando />
          ) : slots.length === 0 ? (
            <Vacio texto="No hay horarios libres este día. Probá con otro." />
          ) : (
            <div className="mt-4 space-y-6 px-5">
              {[
                { titulo: "Mañana", lista: manana },
                { titulo: "Tarde", lista: tarde },
              ]
                .filter((g) => g.lista.length > 0)
                .map((g) => (
                  <div key={g.titulo}>
                    <h2 className="mb-2 text-sm font-semibold text-suave">{g.titulo}</h2>
                    <div className="grid grid-cols-3 gap-2">
                      {g.lista.map((s) => (
                        <button
                          key={s.inicio}
                          onClick={() => {
                            setSlot(s);
                            setError(null);
                            setPaso(3);
                          }}
                          className="h-12 rounded-xl border border-borde bg-superficie text-lg font-semibold tabular-nums active:border-acento active:bg-acento active:text-sobre-acento"
                        >
                          {s.hora}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {/* Paso 4: datos */}
      {paso === 3 && servicio && profesional && slot && (
        <section className="px-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-2xl bg-acento-suave p-4">
            <dt className="text-suave">Servicio</dt>
            <dd className="text-right font-semibold">{servicio.nombre}</dd>
            <dt className="text-suave">Con</dt>
            <dd className="text-right font-semibold">
              {profesional.id === 0 ? "Quien esté libre" : profesional.nombre}
            </dd>
            <dt className="text-suave">Cuándo</dt>
            <dd className="text-right font-semibold first-letter:uppercase">
              {fechaLarga(fecha)}, {slot.hora} hs
            </dd>
            <dt className="text-suave">Precio</dt>
            <dd className="text-right font-semibold tabular-nums">{pesos.format(Number(servicio.precio))}</dd>
          </dl>

          <label className="mt-6 block">
            <span className="text-sm font-medium">Nombre y apellido</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="name"
              className="mt-1.5 h-13 w-full rounded-xl border border-borde bg-superficie px-4 text-lg outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium">Celular</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="11 2345 6789"
              className="mt-1.5 h-13 w-full rounded-xl border border-borde bg-superficie px-4 text-lg outline-none placeholder:text-suave/50 focus:border-acento focus:ring-2 focus:ring-acento/20"
            />
          </label>
          <p className="mt-2 text-sm text-suave">Lo usamos solo para avisarte sobre tu turno.</p>

          {error && <Aviso texto={error} className="mx-0 mt-4" />}

          <div
            className="fixed inset-x-0 bottom-0 border-t border-borde bg-fondo/95 px-5 pt-3 backdrop-blur"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={confirmar}
              disabled={enviando}
              className="mx-auto block h-14 w-full max-w-md rounded-2xl bg-acento text-lg font-semibold text-sobre-acento transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {enviando ? "Reservando…" : "Confirmar turno"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function Confirmacion({ c, onOtro }: { c: Confirmado; onOtro: () => void }) {
  const texto = `Turno en ${NEGOCIO.nombre}: ${c.servicio} con ${c.profesional}, el ${c.fechaTexto} a las ${c.hora} hs.`;
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col px-5"
      style={{
        paddingTop: "max(3rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="grid size-16 place-items-center rounded-full bg-acento text-3xl text-sobre-acento">✓</div>
      <h1 className="mt-6 text-4xl font-titulo font-bold tracking-tight">Turno confirmado</h1>
      <p className="mt-3 text-lg leading-relaxed text-suave">
        Te esperamos el <strong className="text-texto">{c.fechaTexto}</strong> a las{" "}
        <strong className="text-texto">{c.hora} hs</strong>.
      </p>

      <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-y border-borde py-4">
        <dt className="text-suave">Servicio</dt>
        <dd className="text-right font-semibold">{c.servicio}</dd>
        <dt className="text-suave">Te atiende</dt>
        <dd className="text-right font-semibold">{c.profesional}</dd>
        <dt className="text-suave">Precio</dt>
        <dd className="text-right font-semibold tabular-nums">{pesos.format(Number(c.precio))}</dd>
      </dl>

      <div className="mt-auto space-y-3 pt-10">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-14 items-center justify-center rounded-2xl bg-acento text-lg font-semibold text-sobre-acento"
        >
          Compartir por WhatsApp
        </a>
        <button onClick={onOtro} className="h-14 w-full rounded-2xl border border-borde bg-superficie text-lg font-semibold">
          Sacar otro turno
        </button>
      </div>
    </main>
  );
}

function Cargando() {
  return <p className="px-5 py-10 text-center text-suave">Cargando…</p>;
}

function Vacio({ texto }: { texto: string }) {
  return <p className="mx-5 mt-4 rounded-2xl border border-dashed border-borde px-5 py-10 text-center text-suave">{texto}</p>;
}

function Aviso({ texto, className = "mx-5 mb-4" }: { texto: string; className?: string }) {
  return (
    <p role="alert" className={`${className} rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro`}>
      {texto}
    </p>
  );
}
