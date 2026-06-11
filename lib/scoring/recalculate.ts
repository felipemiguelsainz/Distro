import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantDatabase } from "@/lib/supabase/types";
import {
  calcularMetricas,
  segmentarRFM,
  type ClienteAgregado,
  type VentaInput,
} from "./score";

export interface RecalcResult {
  clientesActualizados: number;
  resegmentados: number;
}

/**
 * Recalcula cliente_metricas para los clientes afectados (carga incremental) y
 * re-segmenta RFM globalmente. Pensado para correr con el service role del
 * tenant (Edge Function o server action de confianza), no bloquea la UI.
 *
 * Si `clienteIds` es null, recalcula todos.
 */
export async function recalcularMetricas(
  client: SupabaseClient<TenantDatabase>,
  clienteIds: string[] | null,
  hoy: string = new Date().toISOString().slice(0, 10),
): Promise<RecalcResult> {
  // 1. Cargar ventas de los clientes objetivo y agruparlas.
  const ventasPorCliente = new Map<string, VentaInput[]>();

  const objetivo = clienteIds && clienteIds.length > 0 ? clienteIds : null;
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    let query = client
      .from("ventas")
      .select("cliente_id, fecha, monto, tipo, rubro_id")
      .order("cliente_id")
      .range(from, from + pageSize - 1);
    if (objetivo) query = query.in("cliente_id", objetivo);

    const { data, error } = await query;
    if (error) throw new Error(`[scoring] cargando ventas: ${error.message}`);
    const rows = data ?? [];
    for (const v of rows) {
      const arr = ventasPorCliente.get(v.cliente_id) ?? [];
      arr.push({
        fecha: v.fecha,
        monto: Number(v.monto),
        tipo: v.tipo,
        rubroId: v.rubro_id,
      });
      ventasPorCliente.set(v.cliente_id, arr);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  // 2. Calcular y upsert métricas (sin segmento todavía).
  const upserts: Record<string, unknown>[] = [];
  for (const [clienteId, ventas] of ventasPorCliente) {
    const m = calcularMetricas(ventas, hoy);
    upserts.push({
      cliente_id: clienteId,
      ultima_compra: m.ultimaCompra,
      frecuencia_promedio_dias: m.frecuenciaPromedioDias,
      monto_promedio: m.montoPromedio,
      monto_ultimos_3m: m.montoUltimos3m,
      monto_mismo_mes_ano_anterior: m.montoMismoMesAnoAnterior,
      score_salud: m.scoreSalud,
      proxima_compra_estimada: m.proximaCompraEstimada,
      dias_sin_compra: m.diasSinCompra,
      actualizado_at: new Date().toISOString(),
    });
  }

  const BATCH = 500;
  for (let i = 0; i < upserts.length; i += BATCH) {
    const { error } = await client
      .from("cliente_metricas")
      .upsert(upserts.slice(i, i + BATCH), { onConflict: "cliente_id" });
    if (error) throw new Error(`[scoring] upsert métricas: ${error.message}`);
  }

  // 3. Re-segmentar RFM con la distribución global (lee agregados de todos).
  const agregados: ClienteAgregado[] = [];
  from = 0;
  for (;;) {
    const { data, error } = await client
      .from("cliente_metricas")
      .select(
        "cliente_id, dias_sin_compra, frecuencia_promedio_dias, monto_ultimos_3m, monto_mismo_mes_ano_anterior, score_salud",
      )
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`[scoring] leyendo agregados: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      agregados.push({
        clienteId: r.cliente_id,
        diasSinCompra: r.dias_sin_compra,
        frecuenciaPromedioDias: r.frecuencia_promedio_dias,
        montoUltimos3m: r.monto_ultimos_3m,
        montoMismoMesAnoAnterior: r.monto_mismo_mes_ano_anterior,
        scoreSalud: r.score_salud,
      });
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const segmentos = segmentarRFM(agregados);
  const segUpserts = [...segmentos.entries()].map(([cliente_id, segmento]) => ({
    cliente_id,
    segmento,
  }));
  for (let i = 0; i < segUpserts.length; i += BATCH) {
    const { error } = await client
      .from("cliente_metricas")
      .upsert(segUpserts.slice(i, i + BATCH), { onConflict: "cliente_id" });
    if (error) throw new Error(`[scoring] upsert segmentos: ${error.message}`);
  }

  // 4. Refrescar resumen_diario (agregado por fecha/vendedor/rubro).
  await client.rpc("distro_refresh_resumen_diario" as never);

  return {
    clientesActualizados: upserts.length,
    resegmentados: segUpserts.length,
  };
}
