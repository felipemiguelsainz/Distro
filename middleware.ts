import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getTenantBySlug } from "@/lib/supabase/master";

/**
 * Refresca la sesión del tenant en cada request a `/[tenant]/...`.
 *
 * Como cada tenant es una Supabase distinta, el middleware resuelve el tenant
 * por el primer segmento de ruta y refresca la cookie de auth correspondiente.
 * Sin esto, los tokens expirados no se renuevan en Server Components.
 */
export async function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const slug = segments[0];
  if (!slug) return NextResponse.next();

  let tenant;
  try {
    tenant = await getTenantBySlug(slug);
  } catch {
    return NextResponse.next();
  }
  if (!tenant) return NextResponse.next();

  const response = NextResponse.next({ request });
  const cookieName = `distro-${tenant.slug}-auth`;

  const supabase = createServerClient(
    tenant.supabase_url,
    tenant.supabase_anon_key,
    {
      cookieOptions: { name: cookieName },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Toca la sesión para forzar el refresh si corresponde.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Todo menos assets estáticos y la raíz.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
