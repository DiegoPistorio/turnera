"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { NEGOCIO } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const r = await signIn("credentials", { email, password, redirect: false });
    setCargando(false);
    if (r?.ok) {
      router.replace("/admin");
      router.refresh();
    } else {
      setError("Email o contraseña incorrectos.");
    }
  }

  const campo =
    "mt-1.5 h-13 w-full rounded-xl border border-linea bg-white px-4 text-lg outline-none focus:border-ciruela focus:ring-2 focus:ring-ciruela/20";

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5"
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      <p className="text-sm font-medium text-gris">{NEGOCIO.nombre}</p>
      <h1 className="mt-1 text-[2rem] font-bold leading-tight tracking-tight">Ingresar al panel</h1>

      <form onSubmit={ingresar} className="mt-8">
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            className={campo}
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={campo}
          />
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="mt-6 h-14 w-full rounded-2xl bg-ciruela text-lg font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
