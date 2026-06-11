import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Recomendacion, Segmento, TenantDatabase } from "@/lib/supabase/types";

export interface ClienteRiesgo {
  clienteId: string;
  nombre: string;
  zona: string | null;
  scoreSalud: number | null;
  diasSinCompra: number | null;
  montoPromedio: number | null;
  segmento: Segmento | null;
  motivo: string;
}

/** Construye el motivo de riesgo en lenguaje natural. */
function motivoRiesgo(c: {
  segmento: Segmento | null;
  dias_sin_compra: number | null;
  frecuencia_promedio_dias: number | null;
  monto_ultimos_3m: number | null;
  monto_mismo_mes_ano_anterior: number | null;
}): string {
  const dias = c.dias_sin_compra ?? 0;
  const freq = c.frecuencia_promedio_dias;
  if (c.segmento === "dormido") {
    return `Sin compras hace ${dias} días; dejó de operar con su frecuencia habitual.`;
  }
  if (freq && dias > freq) {
    const exceso = Math.round(dias - freq);
    return `Compra cada ~${Math.round(freq)} días y ya lleva ${dias} (${exceso} de más).`;
  }
  const m3 = c.monto_ultimos_3m ?? 0;
  const mAnt = c.monto_mismo_mes_ano_anterior ?? 0;
  if (mAnt > 0 && m3 < mAnt * 0.7) {
    return `Caída de volumen >30% respecto al mismo período del año anterior.`;
  }
  return `Señales de baja actividad respecto a su comportamiento habitual.`;
}

export async function getClientesEnRiesgo(
  client: SupabaseClient<TenantDatabase>,
  limite = 50,
): Promise<ClienteRiesgo[]> {
  const { data: metricas, error } = await client
    .from("cliente_metricas")
    .select(
      "cliente_id, score_salud, dias_sin_compra, frecuencia_promedio_dias, monto_promedio, monto_ultimos_3m, monto_mismo_mes_ano_anterior, segmento, proxima_compra_estimada",
    )
    .in("segmento", ["riesgo", "dormido"])
    .order("score_salud", { ascending: true })
    .limit(limite);
  if (error) throw new Error(`riesgo: ${error.message}`);

  const ids = (metricas ?? []).map((m) => m.cliente_id);
  const nombres = new Map<string, { nombre: string; zona: string | null }>();
  if (ids.length > 0) {
    const { data: clientes } = await client
      .from("clientes")
      .select("id, nombre_normalizado, zona")
      .in("id", ids);
    for (const c of clientes ?? []) {
      nombres.set(c.id, { nombre: c.nombre_normalizado, zona: c.zona });
    }
  }

  return (metricas ?? []).map((m) => ({
    clienteId: m.cliente_id,
    nombre: nombres.get(m.cliente_id)?.nombre ?? "—",
    zona: nombres.get(m.cliente_id)?.zona ?? null,
    scoreSalud: m.score_salud,
    diasSinCompra: m.dias_sin_compra,
    montoPromedio: m.monto_promedio,
    segmento: m.segmento,
    motivo: motivoRiesgo(m),
  }));
}

export interface SegmentoResumen {
  segmento: Segmento;
  clientes: number;
  montoPromedio: number | null;
}

export async function getSegmentosResumen(
  client: SupabaseClient<TenantDatabase>,
): Promise<SegmentoResumen[]> {
  const { data, error } = await client.rpc("distro_segmentos_resumen" as never);
  if (error) throw new Error(`segmentos: ${error.message}`);
  return ((data as { segmento: Segmento; clientes: number; monto_promedio: number }[]) ?? []).map(
    (r) => ({
      segmento: r.segmento,
      clientes: Number(r.clientes),
      montoPromedio: r.monto_promedio,
    }),
  );
}

export async function getComprasVencidas(
  client: SupabaseClient<TenantDatabase>,
): Promise<number> {
  const { data, error } = await client.rpc("distro_compras_vencidas" as never);
  if (error) return 0;
  return (data as unknown[] | null)?.length ?? 0;
}

export async function getRecomendaciones(
  client: SupabaseClient<TenantDatabase>,
): Promise<Recomendacion[]> {
  const { data, error } = await client
    .from("recomendaciones")
    .select("*")
    .order("prioridad", { ascending: true });
  if (error) throw new Error(`recomendaciones: ${error.message}`);
  return (data ?? []) as Recomendacion[];
}
