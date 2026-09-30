"use client";

import { useTransition } from "react";
import { cambiarEstado } from "./acciones";

type Props = {
  id: number;
  estado: string;
  texto: string;
  confirmar?: string;
  peligro?: boolean;
};

export function BotonEstado({ id, estado, texto, confirmar, peligro }: Props) {
  const [pendiente, iniciar] = useTransition();

  return (
    <button
      disabled={pendiente}
      onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return;
        iniciar(async () => {
          const r = await cambiarEstado(id, estado);
          if (r.error) alert(r.error);
        });
      }}
      className={`h-10 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50 ${
        peligro ? "border-red-200 bg-white text-red-700 active:bg-red-50" : "border-linea bg-white active:bg-ciruela-suave"
      }`}
    >
      {pendiente ? "Guardando…" : texto}
    </button>
  );
}
