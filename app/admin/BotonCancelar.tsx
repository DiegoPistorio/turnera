"use client";

import { useState, useTransition } from "react";
import { cancelar } from "./acciones";

type Props = {
  id: number;
  cliente: string;
  hora: string;
  sena: string | null; // monto ya formateado si la seña está cobrada; null si no hay seña
};

const boton = "h-10 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50";
const peligro = "border-peligro/40 bg-superficie text-peligro active:bg-peligro-suave";

export function BotonCancelar({ id, cliente, hora, sena }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();

  function hacer(por: "cliente" | "barberia" | null) {
    iniciar(async () => {
      const r = await cancelar(id, por);
      if (r.error) alert(r.error);
      else if (r.devolucionFallida) {
        alert("El turno se canceló, pero Mercado Pago no aceptó la devolución. Podés reintentarla desde la agenda.");
      }
    });
  }

  // Sin seña cobrada no importa quién canceló: se confirma y listo, como siempre
  if (!sena) {
    return (
      <button
        disabled={pendiente}
        onClick={() => {
          if (window.confirm(`¿Cancelar el turno de ${cliente} a las ${hora}? El horario queda libre para otra reserva.`)) {
            hacer(null);
          }
        }}
        className={`${boton} ${peligro}`}
      >
        {pendiente ? "Guardando…" : "Cancelar turno"}
      </button>
    );
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className={`${boton} ${peligro}`}>
        Cancelar turno
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-xl border border-borde bg-fondo p-3">
      <p className="text-sm font-semibold">¿Quién cancela el turno de las {hora}?</p>
      <button
        disabled={pendiente}
        onClick={() => hacer("cliente")}
        className={`${boton} ${peligro} block h-auto w-full py-2 text-left`}
      >
        Lo canceló el cliente
        <span className="block text-xs font-normal text-suave">La seña de {sena} no se devuelve.</span>
      </button>
      <button
        disabled={pendiente}
        onClick={() => hacer("barberia")}
        className={`${boton} ${peligro} block h-auto w-full py-2 text-left`}
      >
        Lo cancela la barbería
        <span className="block text-xs font-normal text-suave">Se le devuelven los {sena} por Mercado Pago.</span>
      </button>
      <button
        disabled={pendiente}
        onClick={() => setAbierto(false)}
        className={`${boton} border-borde bg-superficie active:bg-acento-suave`}
      >
        {pendiente ? "Guardando…" : "No cancelar"}
      </button>
    </div>
  );
}
