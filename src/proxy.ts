import { NextResponse, type NextRequest } from "next/server";
import { getCookieCache, getSessionCookie } from "better-auth/cookies";

const AREA_ROLES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["admin", "gestor"] },
  { prefix: "/tecnico", roles: ["tecnico", "admin", "gestor"] },
  { prefix: "/portal", roles: ["cliente", "admin", "gestor"] },
];

function homeFor(role: string) {
  return role === "admin" || role === "gestor" ? "/admin" : role === "tecnico" ? "/tecnico" : "/portal";
}

/**
 * Primeira barreira: sem cookie de sessão → login; com a sessão em cache (assinada),
 * já barra perfis fora da área. A autorização definitiva é feita de novo em cada página
 * e em cada Server Action (o layout sozinho não basta: ele não roda em toda navegação).
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("voltar", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  const area = AREA_ROLES.find((a) => path === a.prefix || path.startsWith(`${a.prefix}/`));
  if (area) {
    const cached = await getCookieCache(request, { secret: process.env.BETTER_AUTH_SECRET }).catch(() => null);
    const role = (cached?.user as { role?: string | null } | undefined)?.role ?? null;
    if (role && !area.roles.includes(role)) {
      return NextResponse.redirect(new URL(homeFor(role), request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/tecnico/:path*", "/portal/:path*"],
};
