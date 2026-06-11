"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantDatabase } from "./types";
import type { TenantPublicConfig } from "./tenant-resolver";

/**
 * Cliente Supabase del tenant para el browser.
 *
 * Las credenciales públicas (url + anon key) se inyectan desde el server vía el
 * TenantProvider; el browser nunca conoce más de un tenant a la vez. Cacheamos
 * por slug para no recrear el cliente en cada render.
 */
const cachePorSlug = new Map<string, SupabaseClient<TenantDatabase>>();

export function tenantBrowserClient(
  config: TenantPublicConfig,
): SupabaseClient<TenantDatabase> {
  const existente = cachePorSlug.get(config.slug);
  if (existente) return existente;

  const client = createBrowserClient<TenantDatabase>(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
      cookieOptions: { name: `distro-${config.slug}-auth` },
    },
  );
  cachePorSlug.set(config.slug, client);
  return client;
}
