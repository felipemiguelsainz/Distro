// Edge Function: recalcular-metricas
// Recalcula cliente_metricas + resumen_diario para los clientes afectados por
// una carga, sin bloquear la UI. Se invoca desde el pipeline con { cliente_ids }.
//
// Deploy: supabase functions deploy recalcular-metricas
// Usa SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (inyectadas por la plataforma).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  calcularMetricas,
  segmentarRFM,
  type Agregado,
  type VentaInput,
} from "../_shared/scoring.ts";

Deno.serve(async (req: Request) => {
  try {
    const { cliente_ids } = await req.json().catch(() => ({ cliente_ids: null }));
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const hoy = new Date().toISOString().slice(0, 10);
    const objetivo: string[] | null =
      Array.isArray(cliente_ids) && cliente_ids.length ? cliente_ids : null;

    // 1. Cargar ventas de los clientes objetivo.
    const ventasPorCliente = new Map<string, VentaInput[]>();
    let from = 0;
    const page = 1000;
    for (;;) {
      let q = supabase
        .from("ventas")
        .select("cliente_id, fecha, monto, tipo, rubro_id")
        .range(from, from + page - 1);
      if (objetivo) q = q.in("cliente_id", objetivo);
      const { data, error } = await q;
      if (error) throw error;
      for (const v of data ?? []) {
        const arr = ventasPorCliente.get(v.cliente_id) ?? [];
        arr.push({ fecha: v.fecha, monto: Number(v.monto), tipo: v.tipo, rubroId: v.rubro_id });
        ventasPorCliente.set(v.cliente_id, arr);
      }
      if ((data ?? []).length < page) break;
      from += page;
    }

    // 2. Métricas por cliente.
    const upserts = [...ventasPorCliente.entries()].map(([cliente_id, ventas]) => ({
      cliente_id,
      ...calcularMetricas(ventas, hoy),
      actualizado_at: new Date().toISOString(),
    }));
    for (let i = 0; i < upserts.length; i += 500) {
      const { error } = await supabase
        .from("cliente_metricas")
        .upsert(upserts.slice(i, i + 500), { onConflict: "cliente_id" });
      if (error) throw error;
    }

    // 3. Re-segmentar RFM global.
    const agregados: Agregado[] = [];
    from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("cliente_metricas")
        .select("cliente_id, dias_sin_compra, frecuencia_promedio_dias, monto_ultimos_3m, monto_mismo_mes_ano_anterior, score_salud")
        .range(from, from + page - 1);
      if (error) throw error;
      for (const r of data ?? []) agregados.push(r as Agregado);
      if ((data ?? []).length < page) break;
      from += page;
    }
    const segs = [...segmentarRFM(agregados).entries()].map(([cliente_id, segmento]) => ({
      cliente_id, segmento,
    }));
    for (let i = 0; i < segs.length; i += 500) {
      const { error } = await supabase
        .from("cliente_metricas")
        .upsert(segs.slice(i, i + 500), { onConflict: "cliente_id" });
      if (error) throw error;
    }

    // 4. Refrescar resumen_diario.
    await supabase.rpc("distro_refresh_resumen_diario");

    return Response.json({
      ok: true,
      clientes: upserts.length,
      resegmentados: segs.length,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
