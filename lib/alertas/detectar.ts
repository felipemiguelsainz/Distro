/**
 * Detección de alertas — lógica PURA.
 *
 * Cada función recibe datos ya calculados (view-model del dashboard / clientes
 * en riesgo) y devuelve las alertas a generar. No hay I/O acá: sin Supabase,
 * sin fetch. Esto la hace testeable y reutilizable.
 *
 * La Edge Function `alertas-diarias` corre en Deno y no puede importar este
 * módulo (alias "@/" + server-only): mantiene una copia en sync en
 * `supabase/functions/_shared/alertas.ts` (mismo patrón que scoring).
 */

import type { SupRow, Tendencia } from "@/lib/analytics/dashboard-view";
import type { ClienteRiesgo } from "@/lib/intelligence/queries";

export interface AlertaDetectada {
  tipo: "vendedor_caida" | "cliente_sin_compra" | "ccc_bajo" | "facturacion_caida";
  titulo: string;
  detalle: string;
  severidad: "alta" | "media" | "baja";
  metadata: Record<string, unknown>;
}

/**
 * Vendedores/equipos cuyo avance vs meta (ajustado por días hábiles) cayó por
 * debajo de `umbralPct`. `SupRow.tendPct` ya es la performance vs lo esperado
 * (100 = en línea). Genera una alerta por equipo rezagado.
 */
export function detectarVendedoresCaidos(
  supervisores: SupRow[],
  umbralPct = 75,
): AlertaDetectada[] {
  return supervisores
    .filter((s) => s.tendPct < umbralPct)
    .map((s) => ({
      tipo: "vendedor_caida" as const,
      titulo: `${s.nombre} por debajo de meta`,
      detalle:
        `Avance ajustado por días hábiles al ${s.tendPct}% de lo esperado ` +
        `(CCC ${s.ccc}, facturación ${s.ytd}).`,
      severidad: s.tendPct < 60 ? "alta" : "media",
      metadata: { nombre: s.nombre, tendPct: s.tendPct, pct: s.pct, ccc: s.ccc, ytd: s.ytd },
    }));
}

/**
 * Clientes que superaron su frecuencia habitual de compra. `getClientesEnRiesgo`
 * ya entrega solo segmentos riesgo/dormido; consideramos "sin compra" a los
 * dormidos y a los que llevan al menos `diasExtra` días sin operar. Se resume en
 * una sola alerta agregada para el digest.
 */
export function detectarClientesSinCompra(
  clientes: ClienteRiesgo[],
  diasExtra = 7,
): AlertaDetectada[] {
  const sinCompra = clientes.filter(
    (c) => c.segmento === "dormido" || (c.diasSinCompra ?? 0) >= diasExtra,
  );
  if (sinCompra.length === 0) return [];

  const top = [...sinCompra]
    .sort((a, b) => (b.diasSinCompra ?? 0) - (a.diasSinCompra ?? 0))
    .slice(0, 3);
  const hayDormidos = sinCompra.some((c) => c.segmento === "dormido");

  return [
    {
      tipo: "cliente_sin_compra",
      titulo: `${sinCompra.length} cliente${sinCompra.length === 1 ? "" : "s"} sin compra reciente`,
      detalle:
        `Superaron su frecuencia habitual de compra. ` +
        `Ej.: ${top.map((c) => `${c.nombre} (${c.diasSinCompra ?? "—"} días)`).join(", ")}.`,
      severidad: hayDormidos || sinCompra.length >= 10 ? "alta" : "media",
      metadata: {
        total: sinCompra.length,
        clienteIds: sinCompra.map((c) => c.clienteId),
      },
    },
  ];
}

/**
 * CCC del mes por debajo del avance esperado según días hábiles.
 * `Tendencia.performanceCcc` es % vs lo esperado (100 = en línea).
 */
export function detectarCccBajo(
  tendencia: Tendencia,
  umbralPct = 80,
): AlertaDetectada[] {
  if (tendencia.performanceCcc >= umbralPct) return [];
  return [
    {
      tipo: "ccc_bajo",
      titulo: "CCC del mes por debajo del ritmo esperado",
      detalle:
        `El CCC va al ${tendencia.performanceCcc}% del avance esperado ` +
        `(día hábil ${tendencia.diasTranscurridos}/${tendencia.diasTotales}).`,
      severidad: tendencia.performanceCcc < 65 ? "alta" : "media",
      metadata: {
        performanceCcc: tendencia.performanceCcc,
        diasTranscurridos: tendencia.diasTranscurridos,
        diasTotales: tendencia.diasTotales,
      },
    },
  ];
}

/**
 * Facturación del mes cayendo respecto al mismo período del año anterior.
 * `umbralPct` es negativo (ej. -10): se alerta si el delta interanual lo supera
 * hacia abajo.
 */
export function detectarFacturacionCaida(
  tendencia: Tendencia,
  umbralPct = -10,
): AlertaDetectada[] {
  const delta = tendencia.deltaFactAnioAnt;
  if (delta == null || delta >= umbralPct) return [];
  return [
    {
      tipo: "facturacion_caida",
      titulo: "Facturación cayendo vs año anterior",
      detalle:
        `La facturación del mes va ${delta}% respecto al mismo período del ` +
        `año anterior.`,
      severidad: delta < -25 ? "alta" : "media",
      metadata: { deltaFactAnioAnt: delta, deltaFactMesAnt: tendencia.deltaFactMesAnt },
    },
  ];
}
