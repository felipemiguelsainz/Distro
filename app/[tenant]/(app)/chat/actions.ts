"use server";

import { getSession } from "@/lib/auth/session";
import { tenantServerClient } from "@/lib/supabase/tenant-server";
import { runChat, type ChatMessage } from "@/lib/ai/chat";

/**
 * Procesa un turno de chat. Corre con la RLS del usuario: un vendedor solo
 * "ve" su cartera también en el chat. Devuelve la respuesta del asistente.
 */
export async function enviarMensaje(
  slug: string,
  history: ChatMessage[],
): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const session = await getSession(slug);
  if (!session) return { ok: false, error: "Sesión requerida" };

  try {
    const { client } = await tenantServerClient(slug);
    const reply = await runChat(client, history);
    return { ok: true, reply };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
