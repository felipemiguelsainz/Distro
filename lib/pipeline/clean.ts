/**
 * Funciones de limpieza/normalización del pipeline.
 * Puras y testeables: no tocan Supabase.
 */

import type { SaleType } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const MESES_EN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MESES_ES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null; // fecha inexistente (ej. 31/02)
  }
  return `${y.toString().padStart(4, "0")}-${m
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

/**
 * Normaliza una fecha a 'YYYY-MM-DD'. Soporta:
 *   "20240315", "2024-03-15", "15/03/2024", "03/15/2024", "Mar 15 2024",
 *   "15-mar-2024", seriales de Excel, y cualquier cosa que Date pueda parsear.
 * Devuelve null si no es interpretable.
 */
export function normalizarFecha(input: unknown): string | null {
  if (input == null || input === "") return null;

  // Date nativo (xlsx puede devolverlo con cellDates)
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return iso(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }

  // Serial de Excel (número de días desde 1899-12-30)
  if (typeof input === "number" && Number.isFinite(input)) {
    if (input > 59 && input < 80000) {
      const ms = Math.round((input - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  const raw = String(input).trim();
  if (!raw) return null;

  // YYYYMMDD compacto
  let m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // ISO YYYY-MM-DD (con o sin tiempo)
  m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY o MM/DD/YYYY (heurística: si el primero > 12 es día)
  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    let yy = +y;
    if (yy < 100) yy += yy < 70 ? 2000 : 1900;
    const ai = +a;
    const bi = +b;
    // Default LATAM: DD/MM. Si a>12 y b<=12 => claramente DD/MM. Si a<=12 y b>12 => MM/DD.
    if (ai > 12 && bi <= 12) return iso(yy, bi, ai);
    if (bi > 12 && ai <= 12) return iso(yy, ai, bi);
    return iso(yy, bi, ai); // ambiguo → DD/MM (es-AR)
  }

  // "Mar 15 2024", "15 mar 2024", "15-mar-2024"
  const tokens = raw.toLowerCase().replace(/[,]/g, " ").split(/[\s-]+/).filter(Boolean);
  if (tokens.length >= 3) {
    let mes: number | undefined;
    let dia: number | undefined;
    let anio: number | undefined;
    for (const t of tokens) {
      const key = t.slice(0, 3);
      if (mes === undefined && (MESES_EN[key] || MESES_ES[key])) {
        mes = MESES_EN[key] ?? MESES_ES[key];
      } else if (/^\d+$/.test(t)) {
        const n = +t;
        if (n > 31) anio = n;
        else if (dia === undefined) dia = n;
        else anio = n;
      }
    }
    if (mes && dia && anio) {
      if (anio < 100) anio += anio < 70 ? 2000 : 1900;
      return iso(anio, mes, dia);
    }
  }

  // Último recurso: Date.parse
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return iso(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
  }
  return null;
}

// ---------------------------------------------------------------------------
// Montos
// ---------------------------------------------------------------------------

/**
 * Limpia un monto a número. Soporta:
 *   "$ 1.234.567,89" (LATAM)  → 1234567.89
 *   "$1,234,567.89" (US)      → 1234567.89
 *   "(1.234,00)" contables    → -1234.00
 *   "-1234,5", "1234.5", "1.234"
 * Devuelve null si no hay dígitos.
 */
export function normalizarMonto(input: unknown): number | null {
  if (input == null || input === "") return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let s = String(input).trim();
  if (!s) return null;

  // Paréntesis contables => negativo
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.includes("-")) negativo = true;

  // Quitar todo lo que no sea dígito, coma o punto
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let decimalSep: "," | "." | null = null;
  if (lastComma !== -1 && lastDot !== -1) {
    // El que aparece más a la derecha es el separador decimal
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma !== -1) {
    // Solo coma: decimal si hay 1-2 dígitos a la derecha, si no es de miles
    const right = s.length - lastComma - 1;
    decimalSep = right >= 1 && right <= 2 ? "," : null;
  } else if (lastDot !== -1) {
    const right = s.length - lastDot - 1;
    decimalSep = right >= 1 && right <= 2 ? "." : null;
  }

  let normalizado: string;
  if (decimalSep) {
    const milesSep = decimalSep === "," ? "." : ",";
    normalizado = s.split(milesSep).join("").replace(decimalSep, ".");
  } else {
    // Sin decimal: todo separador es de miles
    normalizado = s.replace(/[.,]/g, "");
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

// ---------------------------------------------------------------------------
// Tipo de venta / detección de devoluciones
// ---------------------------------------------------------------------------

/**
 * Determina el tipo a partir del monto y/o de una columna "tipo".
 * Devoluciones y notas de crédito: por monto negativo o por etiqueta.
 */
export function detectarTipo(monto: number, etiquetaTipo?: unknown): SaleType {
  if (etiquetaTipo != null && etiquetaTipo !== "") {
    const t = String(etiquetaTipo).toLowerCase();
    if (/(nota.*cred|n\/?c|nc\b)/.test(t)) return "nota_credito";
    if (/(devol|dev\b|return)/.test(t)) return "devolucion";
    if (/(venta|fac|fc\b|sale)/.test(t)) return monto < 0 ? "devolucion" : "venta";
  }
  return monto < 0 ? "devolucion" : "venta";
}

// ---------------------------------------------------------------------------
// Normalización de nombres (para dedupe de clientes)
// ---------------------------------------------------------------------------

const SUFIJOS = /\b(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|ltda?|inc|sociedad anonima)\b/g;

/**
 * Normaliza un nombre/razón social para matching:
 * minúsculas, sin tildes, sin puntuación, sin sufijos societarios, colapsado.
 */
export function normalizarNombre(input: unknown): string {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes / diacríticos
    .replace(SUFIJOS, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizarTexto(input: unknown): string | null {
  const s = String(input ?? "").trim();
  return s === "" ? null : s;
}
