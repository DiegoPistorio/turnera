"use client";

import { useTransition } from "react";
import { borrarCierre } from "./acciones";

export function BotonBorrarCierre({ id }: { id: number }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      disabled={pendiente}
      onClick={() => {
        if (!window.confirm("¿Borrar este cierre? Esos horarios vuelven a estar disponibles para reservar.")) return;
        iniciar(async () => {
          const r = await borrarCierre(id);
          if (r.error) alert(r.error);
        });
      }}
      className="h-10 rounded-xl border border-peligro/40 bg-superficie px-3 text-sm font-semibold text-peligro active:bg-peligro-suave disabled:opacity-50"
    >
      {pendiente ? "…" : "Borrar"}
    </button>
  );
}
