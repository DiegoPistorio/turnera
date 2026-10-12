import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

type FilaPeluquero = {
  id: number;
  nombre: string;
  color: string;
  activo: boolean;
  dias: number[];
  email: string | null;
  acceso: boolean;
};

const LETRA = ["D", "L", "M", "X", "J", "V", "S"];
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

export default async function PeluquerosPage() {
  const session = await getServerSession(authOptions);
  if (session?.user.rol === "profesional") redirect("/admin");

  const peluqueros = await query<FilaPeluquero>(
    `SELECT p.id, p.nombre, p.color, p.activo,
            COALESCE(array_agg(DISTINCT h.dia_semana) FILTER (WHERE h.dia_semana IS NOT NULL), '{}') AS dias,
            u.email, COALESCE(u.activo, false) AS acceso
       FROM profesionales p
       LEFT JOIN horarios h ON h.profesional_id = p.id
       LEFT JOIN usuarios u ON u.id = p.usuario_id
      GROUP BY p.id, u.email, u.activo
      ORDER BY p.activo DESC, p.nombre`
  );

  return (
    <main className="pb-28">
      <div className="flex items-center gap-1 px-5 pt-4">
        <Link
          href="/admin/mas"
          aria-label="Volver"
          className="-ml-3 grid size-10 place-items-center rounded-full text-3xl leading-none active:bg-acento-suave"
        >
          ‹
        </Link>
        <h1 className="font-titulo text-[1.75rem] font-bold tracking-tight">Peluqueros</h1>
      </div>

      <ul className="mt-5 divide-y divide-borde border-y border-borde bg-superficie">
        {peluqueros.map((p) => (
          <li key={p.id}>
            <Link
              href={`/admin/peluqueros/${p.id}`}
              className={`flex items-center gap-4 px-5 py-4 active:bg-acento-suave ${p.activo ? "" : "opacity-55"}`}
            >
              <span
                className="grid size-11 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
                style={{ backgroundColor: p.color }}
              >
                {p.nombre[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-lg font-semibold">
                  <span className="truncate">{p.nombre}</span>
                  {!p.activo && (
                    <span className="shrink-0 rounded-full bg-borde px-2 py-0.5 text-xs font-semibold text-suave">
                      Inactivo
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-suave">
                  {p.acceso && p.email ? `Entra con ${p.email}` : "Sin acceso al panel"}
                </p>
              </div>
              <span className="flex gap-0.5 font-mono text-xs">
                {ORDEN.map((d) => (
                  <span key={d} className={p.dias.includes(d) ? "text-acento" : "text-borde"}>
                    {LETRA[d]}
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div
        className="fixed inset-x-0 bottom-0 border-t border-borde bg-fondo/95 px-5 pt-3 backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Link
          href="/admin/peluqueros/nuevo"
          className="mx-auto flex h-14 max-w-2xl items-center justify-center rounded-2xl bg-acento text-lg font-semibold text-sobre-acento active:scale-[0.98]"
        >
          + Agregar peluquero
        </Link>
      </div>
    </main>
  );
}
