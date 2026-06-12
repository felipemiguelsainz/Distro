import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Alerta, TenantDatabase } from "@/lib/supabase/types";

/** Inicio del día local en ISO, para acotar las alertas "de hoy". */
export function inicioDelDiaISO(d: Date = new Date()): string {
  const inicio = new Date(d);
  inicio.setHours(0, 0, 0, 0);
  return inicio.toISOString();
}

/**
 * Alertas generadas hoy para el tenant. La RLS solo deja verlas a
 * supervisores/admins; para el resto devuelve lista vacía.
 */
export async function getAlertasHoy(
  client: SupabaseClient<TenantDatabase>,
): Promise<Alerta[]> {
  const { data, error } = await client
    .from("alertas")
    .select("*")
    .gte("created_at", inicioDelDiaISO())
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as Alerta[];
}
