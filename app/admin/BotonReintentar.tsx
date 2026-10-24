"use client";

import { useTransition } from "react";
import { reintentarDevolucion } from "./acciones";

export function BotonReintentar({ turnoId }: { turnoId: number }) {
  const [pendiente, iniciar] = useTransition();

  return (
    <button
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          const r = await reintentarDevolucion(turnoId);
          if (r.error) alert(r.error);
        })
      }
      className="h-10 shrink-0 rounded-xl bg-acento px-3 text-sm font-semibold text-sobre-acento disabled:opacity-50"
    >
      {pendiente ? "Intentando…" : "Reintentar"}
    </button>
  );
}
