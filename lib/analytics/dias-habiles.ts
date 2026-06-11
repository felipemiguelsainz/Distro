/**
 * Cálculo de días hábiles (lunes a viernes, sin feriados por ahora).
 * Funciones puras, solo Date, sin dependencias externas.
 */

function aMediodia(d: Date): Date {
  // Normaliza a mediodía local para evitar saltos por horario de verano.
  const c = new Date(d);
  c.setHours(12, 0, 0, 0);
  return c;
}

function esHabil(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/** Cantidad de días hábiles entre dos fechas, inclusive ambos extremos. */
export function diasHabilesEntre(desde: Date, hasta: Date): number {
  const cur = aMediodia(desde);
  const fin = aMediodia(hasta);
  if (cur > fin) return 0;
  let count = 0;
  while (cur <= fin) {
    if (esHabil(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Días hábiles desde el 1 del mes hasta hoy (inclusive). */
export function diasHabilesTranscurridos(hoy: Date = new Date()): number {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return diasHabilesEntre(inicio, hoy);
}

/** Total de días hábiles del mes de `hoy`. */
export function diasHabilesTotales(hoy: Date = new Date()): number {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  return diasHabilesEntre(inicio, fin);
}

/** Fracción del mes (en días hábiles) ya transcurrida, 0-1. */
export function pctMesTranscurrido(hoy: Date = new Date()): number {
  const total = diasHabilesTotales(hoy);
  return total === 0 ? 0 : diasHabilesTranscurridos(hoy) / total;
}

/** Proyección lineal al cierre del mes según el ritmo acumulado. */
export function proyectarAlCierre(acumulado: number, hoy: Date = new Date()): number {
  const transcurridos = diasHabilesTranscurridos(hoy);
  const totales = diasHabilesTotales(hoy);
  if (transcurridos === 0) return acumulado;
  return Math.round((acumulado / transcurridos) * totales);
}

/** Acumulado que se debería haber alcanzado a esta altura del mes. */
export function acumuladoEsperado(meta: number, hoy: Date = new Date()): number {
  return meta * pctMesTranscurrido(hoy);
}

/** Performance vs el avance esperado, en % (100 = en línea con la meta). */
export function performanceVsMeta(
  acumulado: number,
  meta: number,
  hoy: Date = new Date(),
): number {
  const esperado = acumuladoEsperado(meta, hoy);
  if (esperado <= 0) return 0;
  return Math.round((acumulado / esperado) * 100);
}
