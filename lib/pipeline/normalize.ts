/**
 * Orquestador del pipeline: staging → ventas normalizadas.
 *
 * Flujo:
 *   1. Se sube el Excel → se crea `uploads` + filas en `staging_ventas`.
 *   2. processUpload() mapea y limpia cada fila, resuelve cliente/vendedor/rubro,
 *      calcula un dedupe_hash y hace insert idempotente en `ventas`.
 *
 * Cargas incrementales: el unique(dedupe_hash) descarta filas ya cargadas en
 * uploads anteriores, así no se reprocesa todo. Devuelve el set de clientes
 * afectados para que el scoring recalcule solo esas métricas.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ColumnMapping,
  TenantDatabase,
  UploadError,
  Venta,
} from "@/lib/supabase/types";
import { ClienteResolver } from "./dedupe";
import { RubroResolver, VendedorResolver } from "./resolvers";
import { indexarMapeo, mapearFila, validarMapeo, type FilaCanonica } from "./mapping";

export interface ProcessResult {
  uploadId: string;
  rowsProcesadas: number;
  insertadas: number;
  duplicadas: number;
  errores: UploadError[];
  clientesAfectados: string[];
}

function dedupeHash(f: FilaCanonica): string {
  const sig = [
    f.fecha_venta,
    (f.id_cliente ?? f.nombre_cliente).toLowerCase(),
    f.monto.toFixed(2),
    f.tipo,
    f.id_vendedor ?? f.nombre_vendedor ?? "",
    f.categoria ?? "",
  ].join("¦");
  return createHash("sha1").update(sig).digest("hex");
}

const BATCH = 500;

/**
 * Procesa todas las filas de staging pendientes de un upload.
 */
export async function processUpload(
  supabase: SupabaseClient<TenantDatabase>,
  uploadId: string,
  mappings: ColumnMapping[],
): Promise<ProcessResult> {
  const idx = indexarMapeo(mappings);
  const faltantes = validarMapeo(idx);
  if (faltantes.length > 0) {
    throw new Error(
      `[pipeline] Mapeo incompleto, faltan campos requeridos: ${faltantes.join(", ")}`,
    );
  }

  await supabase.from("uploads").update({ status: "processing" }).eq("id", uploadId);

  const clienteResolver = new ClienteResolver(supabase);
  const vendedorResolver = new VendedorResolver(supabase);
  const rubroResolver = new RubroResolver(supabase);
  await Promise.all([
    clienteResolver.cargar(),
    vendedorResolver.cargar(),
    rubroResolver.cargar(),
  ]);

  const errores: UploadError[] = [];
  const clientesAfectados = new Set<string>();
  let rowsProcesadas = 0;
  let insertadas = 0;
  let duplicadas = 0;

  // Recorremos staging paginado.
  const pageSize = 1000;
  let from = 0;
  let rowNumber = 0;

  for (;;) {
    const { data: staging, error } = await supabase
      .from("staging_ventas")
      .select("id, raw_data")
      .eq("upload_id", uploadId)
      .eq("procesado", false)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`[pipeline] leyendo staging: ${error.message}`);
    const rows = staging ?? [];
    if (rows.length === 0) break;

    const ventasBatch: Partial<Venta>[] = [];
    const stagingProcesados: string[] = [];

    for (const s of rows) {
      rowNumber += 1;
      rowsProcesadas += 1;
      const { fila, errores: errs } = mapearFila(
        s.raw_data as Record<string, unknown>,
        idx,
      );
      stagingProcesados.push(s.id);
      if (!fila) {
        for (const e of errs) errores.push({ row: rowNumber, ...e });
        continue;
      }

      const clienteId = await clienteResolver.resolverOCrear({
        nombre: fila.nombre_cliente,
        zona: fila.zona,
        codigoExterno: fila.id_cliente,
      });
      const vendedorId = await vendedorResolver.resolver(
        fila.nombre_vendedor,
        fila.id_vendedor,
      );
      const rubroId = await rubroResolver.resolver(fila.categoria);

      clientesAfectados.add(clienteId);
      ventasBatch.push({
        fecha: fila.fecha_venta,
        cliente_id: clienteId,
        vendedor_id: vendedorId,
        rubro_id: rubroId,
        monto: fila.monto,
        tipo: fila.tipo,
        dedupe_hash: dedupeHash(fila),
      });
    }

    // Insert idempotente: ignora duplicados por dedupe_hash (carga incremental).
    for (let i = 0; i < ventasBatch.length; i += BATCH) {
      const slice = ventasBatch.slice(i, i + BATCH);
      const { data, error: insErr } = await supabase
        .from("ventas")
        .upsert(slice, { onConflict: "dedupe_hash", ignoreDuplicates: true })
        .select("id");
      if (insErr) throw new Error(`[pipeline] insertando ventas: ${insErr.message}`);
      const n = data?.length ?? 0;
      insertadas += n;
      duplicadas += slice.length - n;
    }

    // Marcar staging como procesado.
    await supabase
      .from("staging_ventas")
      .update({ procesado: true })
      .in("id", stagingProcesados);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  await supabase
    .from("uploads")
    .update({
      status: errores.length > 0 && insertadas === 0 ? "failed" : "completed",
      rows_procesadas: rowsProcesadas,
      errores: errores.length > 0 ? errores : null,
    })
    .eq("id", uploadId);

  return {
    uploadId,
    rowsProcesadas,
    insertadas,
    duplicadas,
    errores,
    clientesAfectados: [...clientesAfectados],
  };
}
