"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { tenantServerClient } from "@/lib/supabase/tenant-server";
import { masterClient } from "@/lib/supabase/master";
import type { DistroModule } from "@/lib/supabase/types";

type ActionResult = { ok: boolean; error?: string };

async function adminGuard(slug: string) {
  await requireRole(slug, ["admin", "super_admin"]);
  return tenantServerClient(slug);
}

export async function agregarRubro(slug: string, nombre: string): Promise<ActionResult> {
  const { client } = await adminGuard(slug);
  const { error } = await client.from("rubros").insert({ nombre: nombre.trim(), activo: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${slug}/admin/onboarding`);
  return { ok: true };
}

export async function agregarEquipo(slug: string, nombre: string): Promise<ActionResult> {
  const { client } = await adminGuard(slug);
  const { error } = await client.from("equipos").insert({ nombre: nombre.trim() });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${slug}/admin/onboarding`);
  return { ok: true };
}

export async function agregarVendedor(
  slug: string,
  input: { nombre: string; equipoId: string | null },
): Promise<ActionResult> {
  const { client } = await adminGuard(slug);
  const { error } = await client.from("vendedores").insert({
    nombre: input.nombre.trim(),
    equipo_id: input.equipoId,
    activo: true,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${slug}/admin/onboarding`);
  return { ok: true };
}

/**
 * Activa/desactiva módulos del tenant. Vive en la MAESTRA, así que requiere
 * super_admin (es configuración de plataforma, no de datos del tenant).
 */
export async function actualizarModulos(
  slug: string,
  modulos: DistroModule[],
): Promise<ActionResult> {
  await requireRole(slug, ["super_admin"]);
  const { error } = await masterClient()
    .from("tenants")
    .update({ modulos_activos: modulos })
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${slug}`, "layout");
  return { ok: true };
}
