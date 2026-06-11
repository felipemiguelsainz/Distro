/**
 * Creación del upload y carga de filas crudas a staging.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantDatabase } from "@/lib/supabase/types";

const STAGING_BATCH = 1000;

export interface CrearUploadResult {
  uploadId: string;
  totalFilas: number;
}

/**
 * Crea el registro de upload e inserta las filas crudas en staging_ventas.
 * El procesamiento posterior lo hace processUpload().
 */
export async function crearUploadConStaging(
  supabase: SupabaseClient<TenantDatabase>,
  filename: string,
  filas: Record<string, unknown>[],
): Promise<CrearUploadResult> {
  const { data: upload, error } = await supabase
    .from("uploads")
    .insert({ filename, status: "pending", rows_procesadas: 0 })
    .select("id")
    .single();
  if (error || !upload) {
    throw new Error(`[upload] creando upload: ${error?.message}`);
  }

  for (let i = 0; i < filas.length; i += STAGING_BATCH) {
    const slice = filas.slice(i, i + STAGING_BATCH).map((raw) => ({
      upload_id: upload.id,
      raw_data: raw,
      procesado: false,
    }));
    const { error: stErr } = await supabase.from("staging_ventas").insert(slice);
    if (stErr) throw new Error(`[upload] insertando staging: ${stErr.message}`);
  }

  return { uploadId: upload.id, totalFilas: filas.length };
}
