import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BotonSalir } from "../BotonSalir";

export default async function MasPage() {
  const session = await getServerSession(authOptions);
  const esAdmin = session?.user.rol !== "profesional";

  const opciones = [
    { href: "/admin", titulo: "Agenda", detalle: "Turnos del día" },
    ...(esAdmin
      ? [
          { href: "/admin/servicios", titulo: "Servicios y precios", detalle: "Agregar, editar o pausar servicios" },
          { href: "/admin/peluqueros", titulo: "Peluqueros", detalle: "Equipo, días de trabajo y accesos" },
        ]
      : []),
    { href: "/admin/cierres", titulo: "Días sin atención", detalle: "Feriados, vacaciones y cierres" },
  ];

  return (
    <main className="pb-16">
      <h1 className="px-5 pt-5 font-titulo text-[1.75rem] font-bold tracking-tight">Más opciones</h1>
      <ul className="mt-4 divide-y divide-borde border-y border-borde bg-superficie">
        {opciones.map((o) => (
          <li key={o.href}>
            <Link href={o.href} className="flex items-center gap-3 px-5 py-4 active:bg-acento-suave">
              <div className="flex-1">
                <p className="text-lg font-semibold">{o.titulo}</p>
                <p className="text-sm text-suave">{o.detalle}</p>
              </div>
              <span className="text-2xl text-suave">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex items-center justify-between px-5">
        <p className="text-sm text-suave">Sesión iniciada como {session?.user.name}</p>
        <BotonSalir />
      </div>
    </main>
  );
}
