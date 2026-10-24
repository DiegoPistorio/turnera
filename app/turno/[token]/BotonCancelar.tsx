"use client";

import { useState, useTransition } from "react";
import { cancelarPorCliente } from "./acciones";

export function BotonCancelar({ token, sena }: { token: string; sena: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="flex h-14 w-full items-center justify-center rounded-2xl text-lg font-semibold text-peligro"
      >
        Cancelar turno
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-peligro/40 bg-peligro-suave p-4">
      <p className="font-semibold">¿Seguro que querés cancelar el turno?</p>
      <p className="text-sm text-suave">
        {sena ? `La seña de ${sena} no se devuelve. ` : ""}El horario queda libre para otra persona.
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-peligro">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await cancelarPorCliente(token);
              if (r.error) setError(r.error);
            })
          }
          className="h-12 flex-1 rounded-xl bg-peligro font-semibold text-white disabled:opacity-50"
        >
          {pendiente ? "Cancelando…" : "Sí, cancelar"}
        </button>
        <button
          disabled={pendiente}
          onClick={() => setAbierto(false)}
          className="h-12 flex-1 rounded-xl border border-borde bg-superficie font-semibold"
        >
          No
        </button>
      </div>
    </div>
  );
}
