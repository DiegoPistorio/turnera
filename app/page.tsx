import { redirect } from "next/navigation";

// Por ahora la raíz lleva a la reserva. Más adelante: si hay sesión del personal, va a la agenda.
export default function Home() {
  redirect("/reservar");
}
