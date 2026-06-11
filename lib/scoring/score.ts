/**
 * Núcleo de scoring de Distro Intelligence. Funciones PURAS (sin Supabase) para
 * poder testearlas y reutilizarlas tanto en server como en Edge Functions.
 *
 * Calcula, por cliente, a partir de su historial de ventas:
 *   - métricas base (recencia, frecuencia, montos, próxima compra)
 *   - score de salud 0-100 (recencia + regularidad + evolución + mix)
 * La segmentación RFM se hace aparte (necesita la distribución global).
 */

import type { Segmento } from "@/lib/supabase/types";

export interface VentaInput {
  fecha: string; // ISO 'YYYY-MM-DD'
  monto: number; // ya en positivo para ventas; negativo para dev/NC
  tipo: "venta" | "devolucion" | "nota_credito";
  rubroId: string | null;
}

export interface MetricasCliente {
  ultimaCompra: string | null;
  frecuenciaPromedioDias: number | null;
  montoPromedio: number | null;
  montoUltimos3m: number | null;
  montoMismoMesAnoAnterior: number | null;
  scoreSalud: number | null;
  proximaCompraEstimada: string | null;
  diasSinCompra: number | null;
  // Subscores expuestos para depuración / explicación.
  componentes: {
    recencia: number;
    regularidad: number;
    evolucion: number;
    mix: number;
  } | null;
}

const DIA_MS = 86_400_000;

function diffDias(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / DIA_MS);
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function addDays(iso: string, dias: number): string {
  return new Date(Date.parse(iso) + dias * DIA_MS).toISOString().slice(0, 10);
}

/**
 * Calcula las métricas de un cliente. `hoy` se inyecta para tests deterministas.
 */
export function calcularMetricas(
  ventasInput: VentaInput[],
  hoy: string = new Date().toISOString().slice(0, 10),
): MetricasCliente {
  // Solo ventas reales cuentan para recencia/frecuencia.
  const ventas = ventasInput
    .filter((v) => v.tipo === "venta")
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (ventas.length === 0) {
    return {
      ultimaCompra: null,
      frecuenciaPromedioDias: null,
      montoPromedio: null,
      montoUltimos3m: null,
      montoMismoMesAnoAnterior: null,
      scoreSalud: null,
      proximaCompraEstimada: null,
      diasSinCompra: null,
      componentes: null,
    };
  }

  const fechas = ventas.map((v) => v.fecha);
  const ultimaCompra = fechas[fechas.length - 1];
  const diasSinCompra = Math.max(0, diffDias(hoy, ultimaCompra));

  // Intervalos entre compras consecutivas (en días, >0).
  const intervalos: number[] = [];
  for (let i = 1; i < fechas.length; i++) {
    const d = diffDias(fechas[i], fechas[i - 1]);
    if (d > 0) intervalos.push(d);
  }
  const frecuenciaPromedioDias =
    intervalos.length > 0
      ? intervalos.reduce((s, x) => s + x, 0) / intervalos.length
      : null;

  const montoPromedio =
    ventas.reduce((s, v) => s + v.monto, 0) / ventas.length;

  // Montos por ventana
  const hoyMs = Date.parse(hoy);
  const montoUltimos3m = ventas
    .filter((v) => hoyMs - Date.parse(v.fecha) <= 90 * DIA_MS)
    .reduce((s, v) => s + v.monto, 0);

  const [hy, hm] = hoy.split("-").map(Number);
  const montoMismoMesAnoAnterior = ventas
    .filter((v) => {
      const [y, m] = v.fecha.split("-").map(Number);
      return y === hy - 1 && m === hm;
    })
    .reduce((s, v) => s + v.monto, 0);

  const proximaCompraEstimada =
    frecuenciaPromedioDias != null
      ? addDays(ultimaCompra, Math.round(frecuenciaPromedioDias))
      : null;

  // ---- Componentes del score (0-100) ----

  // Recencia: 100 si está dentro de la frecuencia esperada; cae al excederla.
  let recencia: number;
  if (frecuenciaPromedioDias == null) {
    recencia = diasSinCompra <= 30 ? 80 : clamp(80 - (diasSinCompra - 30));
  } else {
    const ratio = diasSinCompra / Math.max(1, frecuenciaPromedioDias);
    recencia = clamp(100 - Math.max(0, ratio - 1) * 80);
  }

  // Regularidad: menor coeficiente de variación de intervalos = más regular.
  let regularidad: number;
  if (intervalos.length < 2 || frecuenciaPromedioDias == null) {
    regularidad = 50;
  } else {
    const media = frecuenciaPromedioDias;
    const varianza =
      intervalos.reduce((s, x) => s + (x - media) ** 2, 0) / intervalos.length;
    const cv = Math.sqrt(varianza) / media;
    regularidad = clamp(100 - cv * 60);
  }

  // Evolución: monto últimos 3m vs 3m previos.
  const prev3mInicio = 180;
  const monto3to6 = ventas
    .filter((v) => {
      const d = (hoyMs - Date.parse(v.fecha)) / DIA_MS;
      return d > 90 && d <= prev3mInicio;
    })
    .reduce((s, v) => s + v.monto, 0);
  let evolucion: number;
  if (monto3to6 <= 0) {
    evolucion = montoUltimos3m > 0 ? 70 : 40;
  } else {
    const tendencia = (montoUltimos3m - monto3to6) / monto3to6; // -1..+inf
    evolucion = clamp(50 + tendencia * 100);
  }

  // Mix: cantidad de rubros distintos comprados (cap a 5 → 100).
  const rubros = new Set(ventas.map((v) => v.rubroId).filter(Boolean));
  const mix = clamp((rubros.size / 5) * 100);

  const scoreSalud = Math.round(
    recencia * 0.4 + regularidad * 0.2 + evolucion * 0.25 + mix * 0.15,
  );

  return {
    ultimaCompra,
    frecuenciaPromedioDias: frecuenciaPromedioDias
      ? Math.round(frecuenciaPromedioDias * 100) / 100
      : null,
    montoPromedio: Math.round(montoPromedio * 100) / 100,
    montoUltimos3m: Math.round(montoUltimos3m * 100) / 100,
    montoMismoMesAnoAnterior: Math.round(montoMismoMesAnoAnterior * 100) / 100,
    scoreSalud,
    proximaCompraEstimada,
    diasSinCompra,
    componentes: {
      recencia: Math.round(recencia),
      regularidad: Math.round(regularidad),
      evolucion: Math.round(evolucion),
      mix: Math.round(mix),
    },
  };
}

// ---------------------------------------------------------------------------
// Segmentación RFM (necesita la distribución global de clientes)
// ---------------------------------------------------------------------------

export interface ClienteAgregado {
  clienteId: string;
  diasSinCompra: number | null;
  frecuenciaPromedioDias: number | null;
  montoUltimos3m: number | null;
  montoMismoMesAnoAnterior: number | null;
  scoreSalud: number | null;
}

/** Devuelve un mapa cliente_id → segmento, calculado con cortes globales. */
export function segmentarRFM(
  clientes: ClienteAgregado[],
): Map<string, Segmento> {
  const out = new Map<string, Segmento>();
  if (clientes.length === 0) return out;

  // Cortes de Monto (M) por terciles sobre monto últimos 3m.
  const montos = clientes
    .map((c) => c.montoUltimos3m ?? 0)
    .sort((a, b) => a - b);
  const q = (p: number) => montos[Math.floor(p * (montos.length - 1))];
  const m33 = q(0.33);
  const m66 = q(0.66);

  for (const c of clientes) {
    const score = c.scoreSalud ?? 0;
    const dias = c.diasSinCompra ?? 9999;
    const freq = c.frecuenciaPromedioDias ?? 30;
    const monto = c.montoUltimos3m ?? 0;
    const vencidoRatio = dias / Math.max(1, freq);

    let seg: Segmento;
    if (vencidoRatio >= 2.5 || (c.frecuenciaPromedioDias == null && dias > 120)) {
      seg = "dormido";
    } else if (score < 45 || vencidoRatio >= 1.5) {
      seg = "riesgo";
    } else if (score >= 75 && monto >= m66) {
      seg = "estrella";
    } else if (
      (c.montoMismoMesAnoAnterior ?? 0) < monto * 0.85 &&
      monto >= m33
    ) {
      // Creciendo respecto al año anterior.
      seg = "crecimiento";
    } else {
      seg = "estable";
    }
    out.set(c.clienteId, seg);
  }
  return out;
}
