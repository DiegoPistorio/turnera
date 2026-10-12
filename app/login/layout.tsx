import { APP_PANEL } from "@/lib/apps";

// El login es parte del panel: desde acá también se puede instalar la app del personal
export const metadata = APP_PANEL;

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
