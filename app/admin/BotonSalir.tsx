"use client";

import { signOut } from "next-auth/react";

export function BotonSalir() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-full px-3 py-1.5 text-sm font-semibold text-acento active:bg-acento-suave"
    >
      Salir
    </button>
  );
}
