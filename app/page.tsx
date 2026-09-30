import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// La raíz decide: el personal logueado va a la agenda, el resto a reservar
export default async function Home() {
  const session = await getServerSession(authOptions);
  redirect(session ? "/admin" : "/reservar");
}
