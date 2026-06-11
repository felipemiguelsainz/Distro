import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantDatabase } from "@/lib/supabase/types";

/** Período en formato 'YYYY-MM'. */
export function periodoActual(): string {
  return new Date().toISOString().slice(0, 7);
}

export function mismoMesAnoAnterior(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}`;
}

export interface Kpis {
  facturacion: number;
  ccc: number;
  visitas: number;
  devoluciones: number;
}

async function kpisDe(
  client: SupabaseClient<TenantDatabase>,
  periodo: string,
): Promise<Kpis> {
  const { data, error } = await client.rpc("distro_kpis", { periodo } as never);
  if (error) throw new Error(`distro_kpis: ${error.message}`);
  const row = (data as Kpis[] | null)?.[0];
  return (
    row ?? { facturacion: 0, ccc: 0, visitas: 0, devoluciones: 0 }
  );
}

export interface DashboardData {
  periodo: string;
  kpis: Kpis;
  /** Estacionalidad: comparación vs mismo mes del año anterior. */
  estacionalidad: {
    facturacionAnterior: number;
    variacionPct: number | null;
  };
  rubros: { rubro: string; facturacion: number; unidades: number }[];
  topClientes: { nombre: string; facturacion: number }[];
}

/**
 * Carga todos los datos del dashboard para un período. Usa las RPC
 * predefinidas, por lo que respeta la RLS del rol que consulta.
 */
export async function getDashboardData(
  client: SupabaseClient<TenantDatabase>,
  periodo: string = periodoActual(),
): Promise<DashboardData> {
  const anterior = mismoMesAnoAnterior(periodo);

  const [kpis, kpisAnt, rubrosRes, topRes] = await Promise.all([
    kpisDe(client, periodo),
    kpisDe(client, anterior),
    client.rpc("distro_ventas_por_rubro", {} as never),
    client.rpc("distro_top_clientes", { periodo, max_filas: 8 } as never),
  ]);

  if (rubrosRes.error) throw new Error(`rubros: ${rubrosRes.error.message}`);
  if (topRes.error) throw new Error(`top clientes: ${topRes.error.message}`);

  const variacionPct =
    kpisAnt.facturacion > 0
      ? ((kpis.facturacion - kpisAnt.facturacion) / kpisAnt.facturacion) * 100
      : null;

  return {
    periodo,
    kpis,
    estacionalidad: {
      facturacionAnterior: kpisAnt.facturacion,
      variacionPct,
    },
    rubros: (rubrosRes.data as { rubro: string; facturacion: number; unidades: number }[]) ?? [],
    topClientes:
      (topRes.data as { nombre: string; facturacion: number }[]) ?? [],
  };
}

export interface AvanceCcc {
  equipoId: string;
  equipoNombre: string;
  cccActual: number;
  cccObjetivo: number;
  avancePct: number;
}

/** Avance de CCC vs meta por equipo (para el dashboard de supervisión). */
export async function getAvanceCccPorEquipo(
  client: SupabaseClient<TenantDatabase>,
  periodo: string = periodoActual(),
): Promise<AvanceCcc[]> {
  const { data: equipos, error } = await client
    .from("equipos")
    .select("id, nombre");
  if (error) throw new Error(`equipos: ${error.message}`);

  const out: AvanceCcc[] = [];
  for (const eq of equipos ?? []) {
    const { data, error: rpcErr } = await client.rpc("distro_avance_ccc", {
      p_equipo_id: eq.id,
      periodo,
    } as never);
    if (rpcErr) continue;
    const row = (data as { ccc_actual: number; ccc_objetivo: number; avance_pct: number }[] | null)?.[0];
    out.push({
      equipoId: eq.id,
      equipoNombre: eq.nombre,
      cccActual: row?.ccc_actual ?? 0,
      cccObjetivo: row?.ccc_objetivo ?? 0,
      avancePct: row?.avance_pct ?? 0,
    });
  }
  return out;
}
