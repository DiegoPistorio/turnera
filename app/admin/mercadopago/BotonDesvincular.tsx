"use client";

import { useTransition } from "react";
import { desvincular } from "./acciones";

export function BotonDesvincular() {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      disabled={pendiente}
      onClick={() => {
        if (!window.confirm("¿Desvincular la cuenta? Mientras no haya una cuenta vinculada no se pueden reservar turnos desde la web.")) return;
        iniciar(async () => {
          const r = await desvincular();
          if (r.error) alert(r.error);
        });
      }}
      className="h-12 w-full rounded-2xl border border-peligro/40 bg-superficie text-base font-semibold text-peligro active:bg-peligro-suave disabled:opacity-50"
    >
      {pendiente ? "Desvinculando…" : "Desvincular cuenta"}
    </button>
  );
}
