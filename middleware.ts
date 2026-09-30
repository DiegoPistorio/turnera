import { withAuth } from "next-auth/middleware";

// Todo lo que está bajo /admin requiere sesión
export default withAuth({ pages: { signIn: "/login" } });

export const config = { matcher: ["/admin/:path*"] };
