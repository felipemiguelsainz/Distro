import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Segmento, TenantDatabase } from "@/lib/supabase/types";

export interface PdvConSalud {
  id: string;
  nombre: string;
  lat: number | null;
  lon: number | null;
  clienteId: string | null;
  clienteNombre: string | null;
  scoreSalud: number | null;
  segmento: Segmento | null;
  diasSinCompra: number | null;
  compraVencida: boolean;
}

/**
 * PDVs con su estado de salud (join a cliente_metricas). Respeta RLS, así que
 * un vendedor ve solo su cartera. Marca `compraVencida` si superó el plazo.
 */
export async function getPdvsConSalud(
  client: SupabaseClient<TenantDatabase>,
): Promise<PdvConSalud[]> {
  const { data: pdvs, error } = await client
    .from("pdvs")
    .select("id, nombre, lat, lon, cliente_id")
    .eq("activo", true);
  if (error) throw new Error(`pdvs: ${error.message}`);

  const clienteIds = [
    ...new Set((pdvs ?? []).map((p) => p.cliente_id).filter(Boolean)),
  ] as string[];

  const metricasPorCliente = new Map<
    string,
    { score: number | null; segmento: Segmento | null; dias: number | null; vencida: boolean }
  >();
  const nombrePorCliente = new Map<string, string>();

  if (clienteIds.length > 0) {
    const [{ data: metricas }, { data: clientes }] = await Promise.all([
      client
        .from("cliente_metricas")
        .select(
          "cliente_id, score_salud, segmento, dias_sin_compra, proxima_compra_estimada",
        )
        .in("cliente_id", clienteIds),
      client.from("clientes").select("id, nombre_normalizado").in("id", clienteIds),
    ]);

    const hoy = new Date().toISOString().slice(0, 10);
    for (const m of metricas ?? []) {
      metricasPorCliente.set(m.cliente_id, {
        score: m.score_salud,
        segmento: m.segmento,
        dias: m.dias_sin_compra,
        vencida:
          !!m.proxima_compra_estimada && m.proxima_compra_estimada < hoy,
      });
    }
    for (const c of clientes ?? []) {
      nombrePorCliente.set(c.id, c.nombre_normalizado);
    }
  }

  return (pdvs ?? []).map((p) => {
    const m = p.cliente_id ? metricasPorCliente.get(p.cliente_id) : undefined;
    return {
      id: p.id,
      nombre: p.nombre,
      lat: p.lat,
      lon: p.lon,
      clienteId: p.cliente_id,
      clienteNombre: p.cliente_id
        ? nombrePorCliente.get(p.cliente_id) ?? null
        : null,
      scoreSalud: m?.score ?? null,
      segmento: m?.segmento ?? null,
      diasSinCompra: m?.dias ?? null,
      compraVencida: m?.vencida ?? false,
    };
  });
}
