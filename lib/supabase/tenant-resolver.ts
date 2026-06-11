import "server-only";

import { cache } from "react";

import { getTenantBySlug } from "./master";
import type { TenantRecord } from "./types";

/**
 * Resuelve el tenant del request a partir del slug de la ruta `/[tenant]/...`.
 *
 * Envuelto en `cache()` de React: dentro de un mismo render server se resuelve
 * una sola vez aunque se llame desde múltiples server components.
 */
export const resolveTenant = cache(
  async (slug: string): Promise<TenantRecord> => {
    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      throw new TenantNotFoundError(slug);
    }
    return tenant;
  },
);

export class TenantNotFoundError extends Error {
  constructor(public slug: string) {
    super(`[distro] Tenant no encontrado o inactivo: "${slug}"`);
    this.name = "TenantNotFoundError";
  }
}

/** Credenciales públicas del tenant, seguras para pasar al browser. */
export interface TenantPublicConfig {
  id: string;
  slug: string;
  nombre: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  modulosActivos: string[];
}

export function toPublicConfig(tenant: TenantRecord): TenantPublicConfig {
  return {
    id: tenant.id,
    slug: tenant.slug,
    nombre: tenant.nombre,
    supabaseUrl: tenant.supabase_url,
    supabaseAnonKey: tenant.supabase_anon_key,
    modulosActivos: tenant.modulos_activos,
  };
}
