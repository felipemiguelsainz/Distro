"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { inicioDelDiaISO } from "@/lib/alertas/queries";
import { tenantServerClient } from "@/lib/supabase/tenant-server";

/**
 * Marca como leídas todas las alertas del día del tenant. La RLS de `alertas`
 * solo permite el update a supervisores/admins.
 */
export async function marcarAlertasLeidas(slug: string): Promise<void> {
  await requireRole(slug, ["admin", "super_admin", "supervisor"]);
  const { client } = await tenantServerClient(slug);

  await client
    .from("alertas")
    .update({ leida: true })
    .gte("created_at", inicioDelDiaISO())
    .eq("leida", false);

  revalidatePath(`/${slug}`, "layout");
}
