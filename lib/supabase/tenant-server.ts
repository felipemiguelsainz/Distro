import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resolveTenant } from "./tenant-resolver";
import type { TenantDatabase, TenantRecord } from "./types";

/**
 * Cookie name por tenant. Como cada tenant es una Supabase distinta, las
 * sesiones NO deben compartir cookie; usamos el slug para aislar.
 */
function cookieName(tenant: TenantRecord): string {
  return `distro-${tenant.slug}-auth`;
}

/**
 * Cliente Supabase del tenant para Server Components / Route Handlers / Server
 * Actions. Usa la anon key del tenant + la sesión del usuario (cookies), de
 * modo que RLS aplica con el rol del usuario.
 *
 * IMPORTANTE: no existe un cliente global. Cada request resuelve su tenant y
 * crea un cliente nuevo con esas credenciales.
 */
export async function tenantServerClient(
  slug: string,
): Promise<{ client: SupabaseClient<TenantDatabase>; tenant: TenantRecord }> {
  const tenant = await resolveTenant(slug);
  const cookieStore = await cookies();
  const name = cookieName(tenant);

  const client = createServerClient<TenantDatabase>(
    tenant.supabase_url,
    tenant.supabase_anon_key,
    {
      cookieOptions: { name },
      // Datos del dashboard siempre frescos (sin cache de fetch de Next).
      global: {
        fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll llamado desde un Server Component: ignorable, el refresh
            // de sesión lo maneja el middleware.
          }
        },
      },
    },
  );

  return { client, tenant };
}

/**
 * Cliente del tenant con service role. SOLO para procesos server de confianza
 * (pipeline de carga, recálculo de métricas, RPC internas). Bypassa RLS, por lo
 * que nunca debe alimentarse con input directo del usuario sin scoping manual.
 */
export async function tenantAdminClient(
  slug: string,
): Promise<{ client: SupabaseClient<TenantDatabase>; tenant: TenantRecord }> {
  const tenant = await resolveTenant(slug);
  if (!tenant.supabase_service_role_key) {
    throw new Error(
      `[distro] Tenant "${slug}" no tiene service role key configurada en la maestra.`,
    );
  }
  const client = createClient<TenantDatabase>(
    tenant.supabase_url,
    tenant.supabase_service_role_key,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
      },
    },
  );
  return { client, tenant };
}
