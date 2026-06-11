// Copia Deno-friendly del algoritmo de scoring (lib/scoring/score.ts).
// Mantener en sync con el server. Sin imports de Node ni alias "@/".

export type Segmento = "estrella" | "crecimiento" | "estable" | "riesgo" | "dormido";

export interface VentaInput {
  fecha: string;
  monto: number;
  tipo: "venta" | "devolucion" | "nota_credito";
  rubroId: string | null;
}

const DIA_MS = 86_400_000;
const diff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DIA_MS);
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const addDays = (iso: string, d: number) =>
  new Date(Date.parse(iso) + d * DIA_MS).toISOString().slice(0, 10);

export function calcularMetricas(input: VentaInput[], hoy: string) {
  const ventas = input
    .filter((v) => v.tipo === "venta")
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (ventas.length === 0) {
    return {
      ultima_compra: null, frecuencia_promedio_dias: null, monto_promedio: null,
      monto_ultimos_3m: null, monto_mismo_mes_ano_anterior: null, score_salud: null,
      proxima_compra_estimada: null, dias_sin_compra: null,
    };
  }
  const fechas = ventas.map((v) => v.fecha);
  const ultima = fechas[fechas.length - 1];
  const diasSin = Math.max(0, diff(hoy, ultima));
  const intervalos: number[] = [];
  for (let i = 1; i < fechas.length; i++) {
    const d = diff(fechas[i], fechas[i - 1]);
    if (d > 0) intervalos.push(d);
  }
  const freq = intervalos.length
    ? intervalos.reduce((s, x) => s + x, 0) / intervalos.length
    : null;
  const montoProm = ventas.reduce((s, v) => s + v.monto, 0) / ventas.length;
  const hoyMs = Date.parse(hoy);
  const m3m = ventas.filter((v) => hoyMs - Date.parse(v.fecha) <= 90 * DIA_MS)
    .reduce((s, v) => s + v.monto, 0);
  const [hy, hm] = hoy.split("-").map(Number);
  const mAnoAnt = ventas.filter((v) => {
    const [y, m] = v.fecha.split("-").map(Number);
    return y === hy - 1 && m === hm;
  }).reduce((s, v) => s + v.monto, 0);

  let recencia: number;
  if (freq == null) recencia = diasSin <= 30 ? 80 : clamp(80 - (diasSin - 30));
  else recencia = clamp(100 - Math.max(0, diasSin / Math.max(1, freq) - 1) * 80);

  let regularidad = 50;
  if (intervalos.length >= 2 && freq != null) {
    const varza = intervalos.reduce((s, x) => s + (x - freq) ** 2, 0) / intervalos.length;
    regularidad = clamp(100 - (Math.sqrt(varza) / freq) * 60);
  }

  const m3to6 = ventas.filter((v) => {
    const d = (hoyMs - Date.parse(v.fecha)) / DIA_MS;
    return d > 90 && d <= 180;
  }).reduce((s, v) => s + v.monto, 0);
  const evolucion = m3to6 <= 0 ? (m3m > 0 ? 70 : 40) : clamp(50 + ((m3m - m3to6) / m3to6) * 100);

  const rubros = new Set(ventas.map((v) => v.rubroId).filter(Boolean));
  const mix = clamp((rubros.size / 5) * 100);

  const score = Math.round(recencia * 0.4 + regularidad * 0.2 + evolucion * 0.25 + mix * 0.15);
  return {
    ultima_compra: ultima,
    frecuencia_promedio_dias: freq ? Math.round(freq * 100) / 100 : null,
    monto_promedio: Math.round(montoProm * 100) / 100,
    monto_ultimos_3m: Math.round(m3m * 100) / 100,
    monto_mismo_mes_ano_anterior: Math.round(mAnoAnt * 100) / 100,
    score_salud: score,
    proxima_compra_estimada: freq != null ? addDays(ultima, Math.round(freq)) : null,
    dias_sin_compra: diasSin,
  };
}

export interface Agregado {
  cliente_id: string;
  dias_sin_compra: number | null;
  frecuencia_promedio_dias: number | null;
  monto_ultimos_3m: number | null;
  monto_mismo_mes_ano_anterior: number | null;
  score_salud: number | null;
}

export function segmentarRFM(clientes: Agregado[]): Map<string, Segmento> {
  const out = new Map<string, Segmento>();
  if (!clientes.length) return out;
  const montos = clientes.map((c) => c.monto_ultimos_3m ?? 0).sort((a, b) => a - b);
  const q = (p: number) => montos[Math.floor(p * (montos.length - 1))];
  const m33 = q(0.33), m66 = q(0.66);
  for (const c of clientes) {
    const score = c.score_salud ?? 0;
    const dias = c.dias_sin_compra ?? 9999;
    const freq = c.frecuencia_promedio_dias ?? 30;
    const monto = c.monto_ultimos_3m ?? 0;
    const ratio = dias / Math.max(1, freq);
    let seg: Segmento;
    if (ratio >= 2.5 || (c.frecuencia_promedio_dias == null && dias > 120)) seg = "dormido";
    else if (score < 45 || ratio >= 1.5) seg = "riesgo";
    else if (score >= 75 && monto >= m66) seg = "estrella";
    else if ((c.monto_mismo_mes_ano_anterior ?? 0) < monto * 0.85 && monto >= m33) seg = "crecimiento";
    else seg = "estable";
    out.set(c.cliente_id, seg);
  }
  return out;
}
