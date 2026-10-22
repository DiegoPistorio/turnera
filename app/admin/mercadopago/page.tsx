import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NEGOCIO } from "@/lib/config";
import { cuentaVinculada, problemasDeConfiguracion } from "@/lib/mercadopago";
import { BotonDesvincular } from "./BotonDesvincular";

export const dynamic = "force-dynamic";

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const ERRORES: Record<string, string> = {
  cancelado: "No se completó la autorización en Mercado Pago. Podés intentarlo de nuevo.",
  vencido: "La autorización tardó demasiado o se abrió desde otra pestaña. Probá de nuevo.",
  mercadopago: "Mercado Pago no aceptó la vinculación. Probá de nuevo en unos minutos.",
  configuracion: "Falta configurar la integración en el servidor (ver abajo).",
};

function fecha(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: NEGOCIO.zonaHoraria });
}

export default async function MercadoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ vinculada?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user.rol === "profesional") redirect("/admin");

  const { vinculada, error } = await searchParams;
  const cuenta = await cuentaVinculada();
  const problemas = problemasDeConfiguracion();

  return (
    <main className="pb-16">
      <div className="flex items-center gap-1 px-5 pt-4">
        <Link
          href="/admin/mas"
          aria-label="Volver"
          className="-ml-3 grid size-10 place-items-center rounded-full text-3xl leading-none active:bg-acento-suave"
        >
          ‹
        </Link>
        <h1 className="font-titulo text-[1.75rem] font-bold tracking-tight">Mercado Pago</h1>
      </div>
      <p className="px-5 pt-1 text-sm text-suave">
        Para reservar desde la web, el cliente paga una seña de {pesos.format(NEGOCIO.sena.monto)}. La plata entra
        directo a la cuenta de Mercado Pago que vincules acá.
      </p>

      {vinculada && (
        <p role="status" className="mx-5 mt-5 rounded-xl bg-emerald-400/15 px-4 py-3 text-sm font-medium text-emerald-300">
          Cuenta vinculada. Ya se pueden cobrar señas.
        </p>
      )}
      {error && (
        <p role="alert" className="mx-5 mt-5 rounded-xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro">
          {ERRORES[error] ?? "No se pudo vincular la cuenta. Probá de nuevo."}
        </p>
      )}

      {cuenta ? (
        <section className="mx-5 mt-5 rounded-2xl border border-borde bg-superficie p-5">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <span className="size-2.5 rounded-full bg-emerald-400" aria-hidden />
            Cuenta vinculada
            {cuenta.modoPrueba && (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                Modo prueba
              </span>
            )}
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-suave">N.º de cuenta</dt>
            <dd className="text-right font-medium tabular-nums">{cuenta.mpUserId}</dd>
            <dt className="text-suave">Vinculada el</dt>
            <dd className="text-right font-medium">{fecha(cuenta.vinculadaEn)}</dd>
            <dt className="text-suave">Permiso válido hasta</dt>
            <dd className="text-right font-medium">{fecha(cuenta.tokenVenceEn)}</dd>
          </dl>
          <p className="mt-3 text-sm text-suave">El permiso se renueva solo mientras la cuenta esté en uso.</p>
          <div className="mt-5 space-y-3">
            {problemas.length === 0 && (
              <a
                href="/api/mercadopago/oauth/iniciar"
                className="flex h-12 items-center justify-center rounded-2xl border border-borde bg-superficie text-base font-semibold active:bg-acento-suave"
              >
                Vincular otra cuenta
              </a>
            )}
            <BotonDesvincular />
          </div>
        </section>
      ) : (
        <section className="mx-5 mt-5 rounded-2xl border border-borde bg-superficie p-5">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <span className="size-2.5 rounded-full bg-peligro" aria-hidden />
            Sin cuenta vinculada
          </p>
          <p className="mt-2 text-sm text-suave">
            Te vamos a llevar a Mercado Pago para que ingreses con la cuenta de la barbería y autorices a la app a
            cobrar las señas y devolverlas cuando canceles un turno. Tu contraseña nunca pasa por esta app.
          </p>
          {problemas.length === 0 && (
            <a
              href="/api/mercadopago/oauth/iniciar"
              className="mt-5 flex h-14 items-center justify-center rounded-2xl bg-acento text-lg font-semibold text-sobre-acento active:scale-[0.98]"
            >
              Vincular Mercado Pago
            </a>
          )}
        </section>
      )}

      {problemas.length > 0 && (
        <section className="mx-5 mt-5 rounded-2xl bg-peligro-suave p-5 text-sm text-peligro">
          <p className="font-semibold">Falta configurar el servidor</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-2">Se cargan en las variables de entorno de Coolify; después hay que hacer Redeploy.</p>
        </section>
      )}
    </main>
  );
}
