import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NEGOCIO } from "@/lib/config";
import { BotonSalir } from "./BotonSalir";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-10">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-linea bg-papel/95 px-5 pb-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <p className="font-bold">{NEGOCIO.nombre}</p>
        <div className="flex items-center gap-1">
          <span className="text-sm text-gris">{session.user.name}</span>
          <BotonSalir />
        </div>
      </header>
      {children}
    </div>
  );
}
