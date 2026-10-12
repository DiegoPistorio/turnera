import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Marca } from "@/components/Marca";
import { APP_PANEL } from "@/lib/apps";
import { BotonSalir } from "./BotonSalir";

export const metadata = APP_PANEL;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-10">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-borde bg-fondo/95 px-5 pb-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Marca />
        <div className="flex items-center gap-1">
          <Link
            href="/admin/cierres"
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-acento active:bg-acento-suave"
          >
            Cierres
          </Link>
          <BotonSalir />
        </div>
      </header>
      {children}
    </div>
  );
}
