"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarPeluquero } from "../acciones";

export type PeluqueroInicial = {
  id: number | null;
  nombre: string;
  color: string;
  dias: number[];
  servicios: number[];
  activo: boolean;
  acceso: boolean;
  email: string;
  tieneUsuario: boolean;
  turnosFuturos: number;
};

// Colores para distinguir a cada peluquero en la agenda (legibles sobre fondo oscuro)
const COLORES = ["#ec4899", "#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#eab308", "#ef4444", "#14b8a6"];
const DIAS = [
  { n: 1, corto: "Lun" },
  { n: 2, corto: "Mar" },
  { n: 3, corto: "Mié" },
  { n: 4, corto: "Jue" },
  { n: 5, corto: "Vie" },
  { n: 6, corto: "Sáb" },
  { n: 0, corto: "Dom" },
];

const campo =
  "mt-1.5 h-13 w-full rounded-xl border border-borde bg-superficie px-4 text-lg outline-none focus:border-acento focus:ring-2 focus:ring-acento/20";

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-xl border px-3 py-2.5 font-semibold transition-colors ${
        activo ? "border-acento bg-acento text-sobre-acento" : "border-borde bg-superficie"
      }`}
    >
      {children}
    </button>
  );
}

function Interruptor({
  titulo,
  detalle,
  valor,
  onChange,
}: {
  titulo: string;
  detalle: string;
  valor: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-borde bg-superficie px-4 py-3">
      <span>
        <span className="block font-semibold">{titulo}</span>
        <span className="text-sm text-suave">{detalle}</span>
      </span>
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 shrink-0 accent-[var(--color-acento)]"
      />
    </label>
  );
}

export function PeluqueroForm({
  inicial,
  servicios,
  horario,
  diasAtencion,
}: {
  inicial: PeluqueroInicial;
  servicios: { id: number; nombre: string; activo: boolean }[];
  horario: string;
  diasAtencion: number[];
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial.nombre);
  const [color, setColor] = useState(inicial.color || COLORES[0]);
  const [dias, setDias] = useState<number[]>(inicial.dias);
  const [elegidos, setElegidos] = useState<number[]>(inicial.servicios);
  const [activo, setActivo] = useState(inicial.activo);
  const [acceso, setAcceso] = useState(inicial.acceso);
  const [email, setEmail] = useState(inicial.email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const colores = COLORES.includes(color) ? COLORES : [color, ...COLORES];
  const alternar = (lista: number[], x: number) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);

  function guardar() {
    setError(null);
    if (!activo && inicial.activo && inicial.turnosFuturos > 0) {
      const ok = window.confirm(
        `${inicial.nombre} tiene ${inicial.turnosFuturos} turnos reservados a futuro. Al desactivarlo deja de recibir reservas nuevas, pero esos turnos siguen en la agenda: avisale a esos clientes. ¿Continuar?`
      );
      if (!ok) return;
    }
    iniciar(async () => {
      const r = await guardarPeluquero({
        id: inicial.id,
        nombre,
        color,
        dias,
        servicios: elegidos,
        activo,
        acceso,
        email,
        password,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.push("/admin/peluqueros");
      router.refresh();
    });
  }

  return (
    <div className="space-y-7 px-5 pb-40 pt-4">
      <label className="block">
        <span className="text-sm font-medium">Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
      </label>

      <div>
        <span className="text-sm font-medium">Color en la agenda</span>
        <div className="mt-2 flex flex-wrap gap-3">
          {colores.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              className={`size-10 rounded-full ring-offset-2 ring-offset-fondo ${color === c ? "ring-2 ring-texto" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div>
        <span className="text-sm font-medium">Días que trabaja</span>
        <span className="ml-2 text-sm text-suave">de {horario}</span>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {DIAS.filter((d) => diasAtencion.includes(d.n)).map((d) => (
            <Chip key={d.n} activo={dias.includes(d.n)} onClick={() => setDias((l) => alternar(l, d.n))}>
              {d.corto}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="text-sm font-medium">Servicios que hace</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {servicios.map((s) => (
            <Chip key={s.id} activo={elegidos.includes(s.id)} onClick={() => setElegidos((l) => alternar(l, s.id))}>
              {s.nombre}
              {!s.activo && <span className="ml-1 text-xs opacity-70">(pausado)</span>}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Interruptor
          titulo="Acceso al panel"
          detalle="Entra con su usuario y ve solo sus turnos."
          valor={acceso}
          onChange={setAcceso}
        />
        {acceso && (
          <div className="space-y-4 rounded-2xl border border-borde p-4">
            <label className="block">
              <span className="text-sm font-medium">Email para entrar</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                className={campo}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">
                {inicial.tieneUsuario ? "Nueva contraseña" : "Contraseña"}
              </span>
              <span className="ml-2 text-sm text-suave">
                {inicial.tieneUsuario ? "dejala vacía para no cambiarla" : "mínimo 8 caracteres"}
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className={campo}
              />
            </label>
          </div>
        )}
      </div>

      <Interruptor
        titulo="Activo"
        detalle="Si lo desactivás, deja de aparecer para reservar."
        valor={activo}
        onChange={setActivo}
      />

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
