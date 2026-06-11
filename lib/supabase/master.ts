import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env, masterServiceRoleKey } from "./env";
import type { MasterDatabase, TenantRecord } from "./types";

/**
 * Cliente de la Supabase MAESTRA (control plane).
 *
 * Usa el service role => SOLO server-side. Sirve para resolver el tenant de un
 * usuario y leer las credenciales de su Supabase. Nunca se expone al browser y
 * la tabla `tenants` no debe ser legible con la anon key.
 */
let _master: SupabaseClient<MasterDatabase> | null = null;

export function masterClient(): SupabaseClient<MasterDatabase> {
  if (_master) return _master;
  _master = createClient<MasterDatabase>(env.master.url, masterServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    // La resolución de tenant debe ser SIEMPRE fresca: Next 14 cachea los GET
    // de fetch por defecto y serviría tenants viejos/inexistentes.
    global: {
      fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
    },
  });
  return _master;
}

/** Devuelve el tenant por slug (subdominio / segmento de ruta). */
export async function getTenantBySlug(
  slug: string,
): Promise<TenantRecord | null> {
  const { data, error } = await masterClient()
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .eq("activo", true)
    .maybeSingle();

  if (error) {
    throw new Error(`[distro] Error resolviendo tenant "${slug}": ${error.message}`);
  }
  return data;
}

export async function getTenantById(id: string): Promise<TenantRecord | null> {
  const { data, error } = await masterClient()
    .from("tenants")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`[distro] Error resolviendo tenant ${id}: ${error.message}`);
  }
  return data;
}

export async function listTenants(): Promise<TenantRecord[]> {
  const { data, error } = await masterClient()
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`[distro] Error listando tenants: ${error.message}`);
  return data ?? [];
}
