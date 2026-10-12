import type { Metadata } from "next";

// Las dos apps instalables: cada pantalla declara a cuál pertenece.
export const APP_CLIENTE: Metadata = {
  manifest: "/manifest-cliente.webmanifest",
  icons: { apple: "/apple-icon-cliente.png" },
  appleWebApp: { capable: true, title: "King Black", statusBarStyle: "black" },
};

export const APP_PANEL: Metadata = {
  manifest: "/manifest-panel.webmanifest",
  icons: { apple: "/apple-icon-panel.png" },
  appleWebApp: { capable: true, title: "KB Panel", statusBarStyle: "black" },
};
