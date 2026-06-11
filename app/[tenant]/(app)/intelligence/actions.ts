"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { tenantAdminClient } from "@/lib/supabase/tenant-server";
import { generarRecomendaciones } from "@/lib/ai/recommendations";

/**
 * Regenera el Centro de Recomendaciones IA. Usa el service role para leer
 * métricas globales y cachear el resultado. Solo admin.
 */
export async function regenerarRecomendaciones(
  slug: string,
): Promise<{ ok: boolean; cantidad?: number; error?: string }> {
  await requireRole(slug, ["admin", "super_admin"]);
  try {
    const { client } = await tenantAdminClient(slug);
    const recos = await generarRecomendaciones(client);
    revalidatePath(`/${slug}/intelligence`);
    return { ok: true, cantidad: recos.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
