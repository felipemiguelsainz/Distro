"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { tenantAdminClient, tenantServerClient } from "@/lib/supabase/tenant-server";
import { recalcularMetricas } from "@/lib/scoring/recalculate";
import {
  crearUploadConStaging,
  mapeoSugerido,
  parseSpreadsheet,
  processUpload,
  type ColumnaDetectada,
  type ProcessResult,
} from "@/lib/pipeline";
import type { CampoDistro } from "@/lib/pipeline";
import type { ColumnMapping } from "@/lib/supabase/types";
import { getCampoDef } from "@/lib/pipeline";

export interface SubirArchivoResult {
  uploadId: string;
  filename: string;
  totalFilas: number;
  columnas: ColumnaDetectada[];
  mapeoSugerido: Partial<Record<CampoDistro, string>>;
}

/**
 * Sube un Excel: parsea, detecta columnas, deja las filas crudas en staging y
 * devuelve la grilla para la pantalla de mapeo. NO procesa todavía.
 */
export async function subirArchivo(
  slug: string,
  formData: FormData,
): Promise<SubirArchivoResult> {
  await requireRole(slug, ["admin", "super_admin"]);
  const { client } = await tenantServerClient(slug);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("No se recibió ningún archivo");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseSpreadsheet(buffer);
  if (parsed.totalFilas === 0) {
    throw new Error("El archivo no contiene filas de datos");
  }

  const { uploadId, totalFilas } = await crearUploadConStaging(
    client,
    file.name,
    parsed.filas,
  );

  return {
    uploadId,
    filename: file.name,
    totalFilas,
    columnas: parsed.columnas,
    mapeoSugerido: mapeoSugerido(parsed.columnas),
  };
}

/**
 * Guarda el mapeo (reutilizable en cargas futuras) y procesa el upload:
 * limpieza → normalización → ventas. Devuelve el resumen + clientes afectados
 * para que el scoring recalcule incrementalmente.
 */
export async function confirmarMapeo(
  slug: string,
  uploadId: string,
  mapeo: Partial<Record<CampoDistro, string>>,
): Promise<ProcessResult> {
  await requireRole(slug, ["admin", "super_admin"]);
  const { client } = await tenantServerClient(slug);

  // Persistir el mapeo (upsert por campo_distro).
  const rows = Object.entries(mapeo)
    .filter(([, col]) => !!col)
    .map(([campo, columna]) => ({
      campo_distro: campo,
      columna_excel: columna as string,
      tipo_transformacion: getCampoDef(campo)?.transformacion ?? "none",
    }));
  if (rows.length > 0) {
    const { error } = await client
      .from("column_mappings")
      .upsert(rows, { onConflict: "campo_distro" });
    if (error) throw new Error(`Guardando mapeo: ${error.message}`);
  }

  const { data: mappings, error: mapErr } = await client
    .from("column_mappings")
    .select("*");
  if (mapErr) throw new Error(`Leyendo mapeo: ${mapErr.message}`);

  const result = await processUpload(
    client,
    uploadId,
    (mappings ?? []) as ColumnMapping[],
  );

  // Disparar recálculo incremental de métricas para los clientes afectados.
  if (result.clientesAfectados.length > 0) {
    await dispararRecalculo(slug, result.clientesAfectados);
  }

  revalidatePath(`/${slug}/dashboard`);
  revalidatePath(`/${slug}/intelligence`);
  return result;
}

/**
 * Recalcula cliente_metricas + resumen_diario solo de los clientes afectados
 * (carga incremental). Usa el service role del tenant.
 *
 * En producción esto puede delegarse a la Edge Function `recalcular-metricas`
 * para no bloquear; acá lo corremos server-side de forma confiable.
 */
async function dispararRecalculo(
  slug: string,
  clienteIds: string[],
): Promise<void> {
  try {
    const { client: admin } = await tenantAdminClient(slug);
    await recalcularMetricas(admin, clienteIds);
  } catch (e) {
    console.warn(`[pipeline] recálculo falló (no fatal para la carga):`, e);
  }
}
