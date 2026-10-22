"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { desvincularCuenta } from "@/lib/mercadopago";

export async function desvincular(): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Tu sesión venció. Volvé a ingresar." };
  if (session.user.rol === "profesional") return { error: "Solo el administrador puede desvincular la cuenta." };

  await desvincularCuenta();
  revalidatePath("/admin/mercadopago");
  return {};
}
