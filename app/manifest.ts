import type { MetadataRoute } from "next";
import { NEGOCIO } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NEGOCIO.nombre,
    short_name: "King Black",
    description: `Turnos de ${NEGOCIO.nombre}`,
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}