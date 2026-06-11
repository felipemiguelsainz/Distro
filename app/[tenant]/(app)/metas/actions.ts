"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { tenantServerClient } from "@/lib/supabase/tenant-server";

/**
 * Edita la meta de CCC de un equipo para un período. La RLS de `metas` permite
 * que el supervisor solo modifique la meta de SU equipo; admin cualquiera.
 */
export async function guardarMeta(
  slug: string,
  input: {
    equipoId: string;
    periodo: string;
    cccObjetivo: number;
    facturacionObjetivo?: number | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(slug, ["admin", "super_admin", "supervisor"]);
  const { client } = await tenantServerClient(slug);

  const { error } = await client.from("metas").upsert(
    {
      equipo_id: input.equipoId,
      periodo: input.periodo,
      ccc_objetivo: Math.max(0, Math.round(input.cccObjetivo)),
      facturacion_objetivo: input.facturacionObjetivo ?? null,
    },
    { onConflict: "equipo_id,periodo" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${slug}/metas`);
  revalidatePath(`/${slug}/dashboard`);
  return { ok: true };
}
