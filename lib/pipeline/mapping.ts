/**
 * Aplica el mapeo columna_excel → campo_distro a una fila cruda y devuelve un
 * registro canónico ya limpio, junto con los errores de validación de la fila.
 */

import type { ColumnMapping, SaleType, UploadError } from "@/lib/supabase/types";
import type { CampoDistro } from "./fields";
import { CAMPOS_REQUERIDOS } from "./fields";
import {
  detectarTipo,
  normalizarFecha,
  normalizarMonto,
  normalizarTexto,
} from "./clean";

export interface FilaCanonica {
  fecha_venta: string; // ISO
  monto: number;
  tipo: SaleType;
  id_cliente: string | null;
  nombre_cliente: string;
  zona: string | null;
  id_vendedor: string | null;
  nombre_vendedor: string | null;
  categoria: string | null;
}

export interface ResultadoFila {
  fila: FilaCanonica | null;
  errores: Omit<UploadError, "row">[];
}

/** Índice rápido campo_distro → columna_excel. */
export function indexarMapeo(
  mappings: ColumnMapping[],
): Map<CampoDistro, string> {
  const idx = new Map<CampoDistro, string>();
  for (const m of mappings) {
    idx.set(m.campo_distro as CampoDistro, m.columna_excel);
  }
  return idx;
}

function valor(
  raw: Record<string, unknown>,
  idx: Map<CampoDistro, string>,
  campo: CampoDistro,
): unknown {
  const col = idx.get(campo);
  if (!col) return undefined;
  return raw[col];
}

/**
 * Transforma una fila cruda en canónica. Recolecta errores en vez de lanzar,
 * para que la carga continúe y se reporten al usuario.
 */
export function mapearFila(
  raw: Record<string, unknown>,
  idx: Map<CampoDistro, string>,
): ResultadoFila {
  const errores: Omit<UploadError, "row">[] = [];

  const fechaRaw = valor(raw, idx, "fecha_venta");
  const fecha = normalizarFecha(fechaRaw);
  if (!fecha) {
    errores.push({
      campo: "fecha_venta",
      valor: fechaRaw,
      motivo: "Fecha no interpretable",
    });
  }

  const montoRaw = valor(raw, idx, "monto");
  const monto = normalizarMonto(montoRaw);
  if (monto == null) {
    errores.push({
      campo: "monto",
      valor: montoRaw,
      motivo: "Monto no interpretable",
    });
  }

  const nombreCliente = normalizarTexto(valor(raw, idx, "nombre_cliente"));
  if (!nombreCliente) {
    errores.push({
      campo: "nombre_cliente",
      valor: valor(raw, idx, "nombre_cliente"),
      motivo: "Nombre de cliente vacío",
    });
  }

  // Validación de requeridos cubierta arriba; si falta algo, no hay fila.
  if (errores.length > 0 || !fecha || monto == null || !nombreCliente) {
    return { fila: null, errores };
  }

  const tipo = detectarTipo(monto, valor(raw, idx, "tipo"));

  return {
    fila: {
      fecha_venta: fecha,
      // Guardamos el monto en positivo para devoluciones/NC; el signo lo
      // representa el `tipo`. Esto simplifica los agregados por tipo.
      monto: tipo === "venta" ? monto : -Math.abs(monto),
      tipo,
      id_cliente: normalizarTexto(valor(raw, idx, "id_cliente")),
      nombre_cliente: nombreCliente,
      zona: normalizarTexto(valor(raw, idx, "zona")),
      id_vendedor: normalizarTexto(valor(raw, idx, "id_vendedor")),
      nombre_vendedor: normalizarTexto(valor(raw, idx, "nombre_vendedor")),
      categoria: normalizarTexto(valor(raw, idx, "categoria")),
    },
    errores,
  };
}

/** Verifica que el mapeo cubra los campos requeridos. */
export function validarMapeo(idx: Map<CampoDistro, string>): string[] {
  const faltantes: string[] = [];
  for (const req of CAMPOS_REQUERIDOS) {
    if (!idx.get(req)) faltantes.push(req);
  }
  return faltantes;
}
