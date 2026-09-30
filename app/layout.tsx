import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { NEGOCIO } from "@/lib/config";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  title: `Turnos | ${NEGOCIO.nombre}`,
  description: `Reservá tu turno en ${NEGOCIO.nombre}`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f4f8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={bricolage.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
