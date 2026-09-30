import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 días: el personal no se loguea todos los días
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const [u] = await query<{
          id: number;
          nombre: string;
          email: string;
          password_hash: string;
          rol: string;
        }>(
          `SELECT id, nombre, email, password_hash, rol
             FROM usuarios
            WHERE lower(email) = $1 AND activo`,
          [email]
        );
        if (!u || !(await bcrypt.compare(password, u.password_hash))) return null;

        return { id: String(u.id), name: u.nombre, email: u.email, rol: u.rol };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.rol = user.rol;
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub;
      session.user.rol = token.rol;
      return session;
    },
  },
};
