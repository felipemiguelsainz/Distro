/**
 * Parseo de archivos Excel/CSV y detección automática de columnas.
 */

import * as XLSX from "xlsx";

import { CAMPOS_DISTRO, type CampoDistro } from "./fields";

export interface ColumnaDetectada {
  nombre: string;
  /** Valores de muestra (primeras filas no vacías). */
  muestras: string[];
  /** Sugerencia de campo Distro basada en heurística de nombre. */
  sugerencia: CampoDistro | null;
}

export interface ParseResult {
  columnas: ColumnaDetectada[];
  /** Filas como objetos { columnaExcel: valor }. */
  filas: Record<string, unknown>[];
  totalFilas: number;
}

/** Heurística nombre de columna → campo Distro. */
const PISTAS: Array<[RegExp, CampoDistro]> = [
  [/fecha|date|trx|f_emis|emision/i, "fecha_venta"],
  [/importe|monto|total|neto|amount|valor/i, "monto"],
  [/cod.*cli|cli.*cod|id.*cli|cuit|nro.*cli/i, "id_cliente"],
  [/razon|nombre.*cli|cli.*nombre|cliente|social/i, "nombre_cliente"],
  [/zona|region|territorio|ruta/i, "zona"],
  [/cod.*vend|vend.*cod|id.*vend|legajo/i, "id_vendedor"],
  [/vendedor|preventista|nombre.*vend/i, "nombre_vendedor"],
  [/rubro|categor|familia|linea|producto|desc.*prod/i, "categoria"],
  [/tipo|comprob|operacion|clase/i, "tipo"],
];

function sugerirCampo(nombre: string): CampoDistro | null {
  for (const [re, campo] of PISTAS) {
    if (re.test(nombre)) return campo;
  }
  return null;
}

/**
 * Parsea un buffer de Excel/CSV. Toma la primera hoja, usa la primera fila
 * como encabezado, y devuelve columnas detectadas + filas crudas.
 */
export function parseSpreadsheet(buffer: ArrayBuffer | Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { columnas: [], filas: [], totalFilas: 0 };
  }
  const sheet = wb.Sheets[sheetName];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  const nombresColumna = filas.length > 0 ? Object.keys(filas[0]) : [];
  const sugeridos = new Set<CampoDistro>();

  const columnas: ColumnaDetectada[] = nombresColumna.map((nombre) => {
    const muestras: string[] = [];
    for (const fila of filas) {
      const v = fila[nombre];
      if (v != null && v !== "") {
        muestras.push(String(v));
        if (muestras.length >= 5) break;
      }
    }
    let sugerencia = sugerirCampo(nombre);
    // No sugerir el mismo campo dos veces.
    if (sugerencia && sugeridos.has(sugerencia)) sugerencia = null;
    if (sugerencia) sugeridos.add(sugerencia);
    return { nombre, muestras, sugerencia };
  });

  return { columnas, filas, totalFilas: filas.length };
}

/** Genera un mapeo inicial sugerido a partir de las columnas detectadas. */
export function mapeoSugerido(
  columnas: ColumnaDetectada[],
): Record<CampoDistro, string> {
  const out = {} as Record<CampoDistro, string>;
  for (const col of columnas) {
    if (col.sugerencia && !out[col.sugerencia]) {
      out[col.sugerencia] = col.nombre;
    }
  }
  return out;
}

export { CAMPOS_DISTRO };
