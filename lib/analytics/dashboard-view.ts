import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantDatabase } from "@/lib/supabase/types";
import {
  diasHabilesTranscurridos,
  diasHabilesTotales,
  pctMesTranscurrido,
  proyectarAlCierre,
  performanceVsMeta,
} from "./dias-habiles";

// ---------------------------------------------------------------------------
// Tipos del view-model del dashboard (los consumen los componentes).
// ---------------------------------------------------------------------------
export interface KpiItem {
  label: string;
  value: string;
  badge?: string;
  neg?: boolean;
  bar: number; // % de la barra de acento
  /** Proyección al cierre del mes, ya formateada (ej. "Proy. $3.1M"). */
  proyeccion?: string;
  /** Performance vs avance esperado (define el color de la barra). */
  performance?: number;
  /** Deltas vs período anterior (verde/rojo). */
  deltaMesAnt?: number | null;
  deltaAnioAnt?: number | null;
}
export interface SupRow {
  nombre: string;
  ytd: string;
  ccc: string;
  pct: number; // avance vs meta (0-100, para la barra)
  tendPct: number; // performance vs esperado (sin tope, para el badge Tend.)
}
export interface Tendencia {
  diasTranscurridos: number;
  diasTotales: number;
  pctMes: number;
  proyeccionFacturacion: number;
  performanceFacturacion: number; // % vs avance esperado
  performanceCcc: number;
  deltaFactMesAnt: number | null;
  deltaFactAnioAnt: number | null;
  deltaCccMesAnt: number | null;
  deltaCccAnioAnt: number | null;
}
export interface FactPoint {
  mes: string;
  y0: number; // año-2  (en millones)
  y1: number; // año-1
  y2: number; // año actual
}
export interface CccPoint {
  mes: string;
  cartera: number;
  ccc: number;
  efectividad: number;
}
export interface MixItem {
  cat: string;
  pct: number;
  color: string;
}
export interface DashboardView {
  hasData: boolean;
  kpis: KpiItem[];
  supervisores: SupRow[];
  yearLabels: { y0: string; y1: string; y2: string };
  badgeFacturacion: string;
  facturacion: FactPoint[];
  ccc: CccPoint[];
  mix: MixItem[];
  tendencia: Tendencia;
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MIX_COLORS = ["#BA7517", "#378ADD", "#7F77DD", "#D85A30", "#2F9E6A"];

// ---------------------------------------------------------------------------
// Demo de fallback: datos ficticios pero realistas. Se usa cuando el tenant
// todavía no cargó ventas (o si las RPCs aún no fueron migradas).
// ---------------------------------------------------------------------------
export const DEMO_VIEW: DashboardView = {
  hasData: false,
  yearLabels: { y0: "2023", y1: "2024", y2: "2025" },
  badgeFacturacion: "+18.2% YTD",
  kpis: [
    { label: "Facturación YTD", value: "$12.4M", badge: "+18.2% vs año anterior", bar: 82, proyeccion: "Proy. $18.2M", performance: 104, deltaMesAnt: 4.3, deltaAnioAnt: 18.2 },
    { label: "CCC del mes", value: "3.847", badge: "91.3% efectividad", bar: 91, proyeccion: "Proy. 4.120", performance: 97, deltaMesAnt: -1.8, deltaAnioAnt: -3.2 },
    { label: "Volumen YTD", value: "920K u.", badge: "-4.1% vs año anterior", neg: true, bar: 74, performance: 88 },
    { label: "Surtido promedio", value: "16.4 refs/PDV", badge: "+2.1 vs 2024", bar: 88, performance: 102 },
  ],
  supervisores: [
    { nombre: "Supervisor A", ytd: "$4.2M", ccc: "1.823", pct: 88, tendPct: 129 },
    { nombre: "Supervisor B", ytd: "$3.8M", ccc: "1.641", pct: 79, tendPct: 116 },
    { nombre: "Supervisor C", ytd: "$1.9M", ccc: "612", pct: 62, tendPct: 91 },
  ],
  facturacion: [
    { mes: "Ene", y0: 0.7, y1: 0.82, y2: 0.95 },
    { mes: "Feb", y0: 0.66, y1: 0.78, y2: 0.9 },
    { mes: "Mar", y0: 0.8, y1: 0.95, y2: 1.12 },
    { mes: "Abr", y0: 0.85, y1: 1.0, y2: 1.18 },
    { mes: "May", y0: 0.9, y1: 1.05, y2: 1.25 },
    { mes: "Jun", y0: 0.88, y1: 1.02, y2: 1.22 },
    { mes: "Jul", y0: 0.95, y1: 1.12, y2: 1.35 },
    { mes: "Ago", y0: 1.0, y1: 1.18, y2: 1.4 },
    { mes: "Sep", y0: 0.97, y1: 1.15, y2: 1.38 },
    { mes: "Oct", y0: 1.05, y1: 1.25, y2: 1.5 },
    { mes: "Nov", y0: 1.1, y1: 1.3, y2: 1.6 },
    { mes: "Dic", y0: 1.2, y1: 1.45, y2: 1.78 },
  ],
  ccc: [
    { mes: "Ene", cartera: 4180, ccc: 3520, efectividad: 84.2 },
    { mes: "Feb", cartera: 4190, ccc: 3480, efectividad: 83.1 },
    { mes: "Mar", cartera: 4210, ccc: 3760, efectividad: 89.3 },
    { mes: "Abr", cartera: 4220, ccc: 3690, efectividad: 87.4 },
    { mes: "May", cartera: 4230, ccc: 3810, efectividad: 90.1 },
    { mes: "Jun", cartera: 4240, ccc: 3650, efectividad: 86.1 },
    { mes: "Jul", cartera: 4250, ccc: 3880, efectividad: 91.3 },
    { mes: "Ago", cartera: 4260, ccc: 3920, efectividad: 92.0 },
    { mes: "Sep", cartera: 4255, ccc: 3790, efectividad: 89.1 },
    { mes: "Oct", cartera: 4270, ccc: 3950, efectividad: 92.5 },
    { mes: "Nov", cartera: 4280, ccc: 3870, efectividad: 90.4 },
    { mes: "Dic", cartera: 4290, ccc: 3847, efectividad: 89.7 },
  ],
  mix: [
    { cat: "Categoría A", pct: 32, color: MIX_COLORS[0] },
    { cat: "Categoría B", pct: 24, color: MIX_COLORS[1] },
    { cat: "Categoría C", pct: 18, color: MIX_COLORS[2] },
    { cat: "Categoría D", pct: 15, color: MIX_COLORS[3] },
    { cat: "Categoría E", pct: 11, color: MIX_COLORS[4] },
  ],
  tendencia: {
    diasTranscurridos: 15,
    diasTotales: 22,
    pctMes: 0.68,
    proyeccionFacturacion: 18235294,
    performanceFacturacion: 104,
    performanceCcc: 97,
    deltaFactMesAnt: 4.3,
    deltaFactAnioAnt: 18.2,
    deltaCccMesAnt: -1.8,
    deltaCccAnioAnt: -3.2,
  },
};

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------
const millones = (n: number) => Math.round((n / 1_000_000) * 100) / 100;
const fmtMoneda = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n).toLocaleString("es-AR")}`;
const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");

/**
 * Construye el view-model del dashboard con DATOS REALES del tenant.
 * Si no hay ventas cargadas (o falla una RPC aún no migrada), devuelve el demo.
 */
export async function getDashboardView(
  client: SupabaseClient<TenantDatabase>,
): Promise<DashboardView> {
  try {
    const { count } = await client
      .from("ventas")
      .select("id", { count: "exact", head: true });
    if (!count || count === 0) return DEMO_VIEW;

    const hoy = new Date();
    const year = hoy.getFullYear();
    const periodo = `${year}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

    const [factRes, cccRes, kpiRes, supRes, rubrosRes, metasRes] = await Promise.all([
      client.rpc("distro_facturacion_mensual" as never, {} as never),
      client.rpc("distro_ccc_mensual" as never, {} as never),
      client.rpc("distro_dashboard_kpis" as never, {} as never),
      client.rpc("distro_supervisores_ytd" as never, {} as never),
      client.rpc("distro_ventas_por_rubro" as never, {} as never),
      client.from("metas").select("facturacion_objetivo, ccc_objetivo").eq("periodo", periodo),
    ]);
    for (const r of [factRes, cccRes, kpiRes, supRes, rubrosRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    // --- Facturación mensual (3 años) ---
    const factRows = (factRes.data ?? []) as { anio: number; mes: number; monto: number }[];
    const facturacion: FactPoint[] = MESES.map((mes, i) => {
      const m = i + 1;
      const pick = (y: number) =>
        millones(Number(factRows.find((r) => r.anio === y && r.mes === m)?.monto ?? 0));
      return { mes, y0: pick(year - 2), y1: pick(year - 1), y2: pick(year) };
    });

    // --- CCC mensual ---
    const cccRows = (cccRes.data ?? []) as { mes: number; ccc: number; cartera: number }[];
    const ccc: CccPoint[] = MESES.map((mes, i) => {
      const row = cccRows.find((r) => r.mes === i + 1);
      const c = Number(row?.ccc ?? 0);
      const cart = Number(row?.cartera ?? 0);
      return {
        mes,
        cartera: cart,
        ccc: c,
        efectividad: cart > 0 ? Math.round((c / cart) * 1000) / 10 : 0,
      };
    });

    // --- KPIs ---
    const k = ((kpiRes.data ?? []) as Record<string, number>[])[0] ?? {};
    const ytd = Number(k.facturacion_ytd ?? 0);
    const ytdPrev = Number(k.facturacion_ytd_prev ?? 0);
    const cccMes = Number(k.ccc_mes ?? 0);
    const clientesActivos = Number(k.clientes_activos ?? 0);
    const ticket = Number(k.ticket_promedio ?? 0);
    const deltaFact = ytdPrev > 0 ? ((ytd - ytdPrev) / ytdPrev) * 100 : null;
    const efectMes = clientesActivos > 0 ? Math.round((cccMes / clientesActivos) * 1000) / 10 : 0;
    const badgeFact = deltaFact != null ? `${deltaFact >= 0 ? "+" : ""}${deltaFact.toFixed(1)}% YTD` : "Año en curso";

    const kpis: KpiItem[] = [
      {
        label: "Facturación YTD",
        value: fmtMoneda(ytd),
        badge: deltaFact != null ? `${deltaFact >= 0 ? "+" : ""}${deltaFact.toFixed(1)}% vs año anterior` : undefined,
        neg: deltaFact != null && deltaFact < 0,
        bar: 82,
      },
      { label: "CCC del mes", value: fmtInt(cccMes), badge: `${efectMes}% efectividad`, bar: Math.min(100, efectMes) },
      { label: "Clientes activos", value: fmtInt(clientesActivos), bar: 80 },
      { label: "Ticket promedio", value: fmtMoneda(ticket), bar: 60 },
    ];

    // --- Supervisores ---
    const supRows = (supRes.data ?? []) as {
      equipo: string;
      facturacion: number;
      ccc: number;
      ccc_objetivo: number;
    }[];
    const supervisores: SupRow[] = supRows.map((s) => {
      const obj = Number(s.ccc_objetivo);
      const c = Number(s.ccc);
      return {
        nombre: s.equipo,
        ytd: fmtMoneda(Number(s.facturacion)),
        ccc: fmtInt(c),
        pct: obj > 0 ? Math.min(100, Math.round((c / obj) * 100)) : 0,
        // Tend. = performance vs avance esperado (sin tope).
        tendPct: obj > 0 ? performanceVsMeta(c, obj, hoy) : 100,
      };
    });

    // --- Mix de categorías (top 5 rubros) ---
    const rubros = (rubrosRes.data ?? []) as { rubro: string; facturacion: number }[];
    const top = rubros
      .filter((r) => Number(r.facturacion) > 0)
      .sort((a, b) => Number(b.facturacion) - Number(a.facturacion))
      .slice(0, 5);
    const totalMix = top.reduce((s, r) => s + Number(r.facturacion), 0) || 1;
    const mix: MixItem[] = top.map((r, i) => ({
      cat: r.rubro,
      pct: Math.round((Number(r.facturacion) / totalMix) * 100),
      color: MIX_COLORS[i % MIX_COLORS.length],
    }));

    // --- Tendencia / seguimiento del mes ---
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const diasTranscurridos = diasHabilesTranscurridos(hoy);
    const diasTotales = diasHabilesTotales(hoy);
    const pctMes = pctMesTranscurrido(hoy);

    const metas = (metasRes.data ?? []) as {
      facturacion_objetivo: number | null;
      ccc_objetivo: number | null;
    }[];
    const metaFactMes = metas.reduce((s, m) => s + Number(m.facturacion_objetivo ?? 0), 0);
    const metaCccMes = metas.reduce((s, m) => s + Number(m.ccc_objetivo ?? 0), 0);

    // Acumulado del mes actual (de la serie mensual) y CCC del mes.
    let acumFactMes = (facturacion[hoy.getMonth()]?.y2 ?? 0) * 1_000_000;
    let cccActualMes = cccMes;

    // Deltas comparando el mismo tramo del mes/año anterior (RPC).
    let deltaFactMesAnt: number | null = null;
    let deltaFactAnioAnt: number | null = null;
    let deltaCccMesAnt: number | null = null;
    let deltaCccAnioAnt: number | null = null;
    try {
      const { data, error } = await client.rpc(
        "distro_kpis_tendencia" as never,
        { p_dias_transcurridos: hoy.getDate() } as never,
      );
      if (error) throw new Error(error.message);
      const t = ((data as Record<string, number>[]) ?? [])[0];
      if (t) {
        const fa = Number(t.facturacion_actual);
        const fm = Number(t.facturacion_mes_ant);
        const faa = Number(t.facturacion_anio_ant);
        const ca = Number(t.ccc_actual);
        const cm = Number(t.ccc_mes_ant);
        const caa = Number(t.ccc_anio_ant);
        if (fa > 0) acumFactMes = fa;
        if (ca > 0) cccActualMes = ca;
        deltaFactMesAnt = fm > 0 ? r1(((fa - fm) / fm) * 100) : null;
        deltaFactAnioAnt = faa > 0 ? r1(((fa - faa) / faa) * 100) : null;
        deltaCccMesAnt = cm > 0 ? r1(((ca - cm) / cm) * 100) : null;
        deltaCccAnioAnt = caa > 0 ? r1(((ca - caa) / caa) * 100) : null;
      }
    } catch (e) {
      // RPC no migrada: deltas quedan en null, el resto se calcula igual.
      console.warn("[dashboard] distro_kpis_tendencia no disponible:", e);
    }

    const proyeccionFacturacion = proyectarAlCierre(acumFactMes, hoy);
    const performanceFacturacion =
      metaFactMes > 0 ? performanceVsMeta(acumFactMes, metaFactMes, hoy) : 100;
    const performanceCcc =
      metaCccMes > 0 ? performanceVsMeta(cccActualMes, metaCccMes, hoy) : 100;

    const tendencia: Tendencia = {
      diasTranscurridos,
      diasTotales,
      pctMes,
      proyeccionFacturacion,
      performanceFacturacion,
      performanceCcc,
      deltaFactMesAnt,
      deltaFactAnioAnt,
      deltaCccMesAnt,
      deltaCccAnioAnt,
    };

    // Enriquecer los KPIs de Facturación y CCC con proyección/performance/deltas.
    kpis[0].proyeccion = `Proy. ${fmtMoneda(proyeccionFacturacion)}`;
    kpis[0].performance = performanceFacturacion;
    kpis[0].deltaMesAnt = deltaFactMesAnt;
    kpis[0].deltaAnioAnt = deltaFactAnioAnt;
    kpis[1].proyeccion = `Proy. ${fmtInt(proyectarAlCierre(cccActualMes, hoy))}`;
    kpis[1].performance = performanceCcc;
    kpis[1].deltaMesAnt = deltaCccMesAnt;
    kpis[1].deltaAnioAnt = deltaCccAnioAnt;

    return {
      hasData: true,
      yearLabels: { y0: String(year - 2), y1: String(year - 1), y2: String(year) },
      badgeFacturacion: badgeFact,
      kpis,
      supervisores: supervisores.length > 0 ? supervisores : DEMO_VIEW.supervisores,
      facturacion,
      ccc,
      mix: mix.length > 0 ? mix : DEMO_VIEW.mix,
      tendencia,
    };
  } catch (e) {
    console.warn("[dashboard] datos reales no disponibles, usando demo:", e);
    return DEMO_VIEW;
  }
}
