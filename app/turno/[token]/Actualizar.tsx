"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Mientras el turno espera el pago, vuelve a consultar cada unos segundos
// para mostrar la confirmación apenas Mercado Pago avisa que se acreditó.
export function Actualizar({ cadaSegundos = 5 }: { cadaSegundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), cadaSegundos * 1000);
    return () => clearInterval(id);
  }, [router, cadaSegundos]);
  return null;
}
