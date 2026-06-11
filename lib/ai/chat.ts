import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantDatabase } from "@/lib/supabase/types";
import { anthropic, MODEL } from "./anthropic";
import { TOOL_DEFINITIONS, ejecutarTool } from "./chat-tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM = `Sos el asistente de datos de Distro. Respondés preguntas sobre las
ventas del tenant en español rioplatense, claro y conciso. Para obtener datos usás
EXCLUSIVAMENTE las herramientas disponibles (que consultan funciones seguras de la
base); nunca inventás números. Si una pregunta no se puede responder con las
herramientas, decilo. Al dar cifras, formateá montos en pesos y redondeá.`;

const MAX_ITERACIONES = 5;

/**
 * Ejecuta el loop de chat con tool-use. El modelo solo puede invocar las RPC
 * predefinidas; las consultas corren con la RLS del usuario (cliente provisto).
 */
export async function runChat(
  client: SupabaseClient<TenantDatabase>,
  history: ChatMessage[],
): Promise<string> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const ai = anthropic();

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const res = await ai.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    if (res.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type === "tool_use") {
          const data = await ejecutarTool(
            client,
            block.name,
            block.input as Record<string, unknown>,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(data),
          });
        }
      }
      // Reinyectamos la respuesta del modelo + resultados de las tools.
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Respuesta final: concatenar bloques de texto.
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }

  return "No pude completar la consulta (demasiados pasos). Probá reformular la pregunta.";
}
