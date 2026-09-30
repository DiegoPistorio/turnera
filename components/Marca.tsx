import Image from "next/image";
import { NEGOCIO } from "@/lib/config";

// Logo + nombre del negocio. "grande" se usa en el login.
export function Marca({ grande = false }: { grande?: boolean }) {
  if (grande) {
    return (
      <Image src={NEGOCIO.logo} alt={NEGOCIO.nombre} width={112} height={112} priority className="size-28" />
    );
  }
  return (
    <span className="flex items-center gap-2.5">
      <Image src={NEGOCIO.logo} alt="" width={32} height={32} className="size-8" />
      <span className="font-titulo text-lg font-bold leading-none">{NEGOCIO.nombre}</span>
    </span>
  );
}
