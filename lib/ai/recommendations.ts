import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantDatabase } from "@/lib/supabase/types";
import { anthropic, MODEL } from "./anthropic";

export type CategoriaReco = "recuperacion" | "crecimiento" | "cobertura" | "alerta";

interface RecoGenerada {
  categoria: CategoriaReco;
  titulo: string;
  detalle: string;
  prioridad: number;
  impacto_estimado: number | null;
  cliente_ids: string[] | null;
}

/**
 * Reúne un contexto compacto de la operación del tenant para alimentar al
 * modelo. Solo métricas precalculadas: nada de SQL libre ni datos crudos.
 */
async function construirContexto(client: SupabaseClient<TenantDatabase>) {
  const hoy = new Date().toISOString().slice(0, 10);

  const [riesgo, segmentos, rubros] = await Promise.all([
    client
      .from("cliente_metricas")
      .select(
        "cliente_id, score_salud, dias_sin_compra, monto_promedio, monto_ultimos_3m, proxima_compra_estimada, segmento",
      )
      .in("segmento", ["riesgo", "dormido"])
      .order("monto_promedio", { ascending: false })
      .limit(30),
    client.rpc("distro_segmentos_resumen" as never),
    client.rpc("distro_ventas_por_rubro" as never, {} as never),
  ]);

  const enRiesgo = (riesgo.data ?? []).map((c) => ({
    cliente_id: c.cliente_id,
    score: c.score_salud,
    dias_sin_compra: c.dias_sin_compra,
    monto_promedio: c.monto_promedio,
    vencido: !!c.proxima_compra_estimada && c.proxima_compra_estimada < hoy,
    segmento: c.segmento,
  }));

  const vencidos = enRiesgo.filter((c) => c.vencido).length;

  return {
    fecha: hoy,
    clientes_en_riesgo: enRiesgo,
    clientes_con_compra_vencida: vencidos,
    segmentos: segmentos.data ?? [],
    rubros: rubros.data ?? [],
  };
}

const TOOL = {
  name: "emitir_recomendaciones",
  description:
    "Emite recomendaciones comerciales accionables y priorizadas para el equipo.",
  input_schema: {
    type: "object" as const,
    properties: {
      recomendaciones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            categoria: {
              type: "string",
              enum: ["recuperacion", "crecimiento", "cobertura", "alerta"],
            },
            titulo: { type: "string", description: "Acción concreta y breve." },
            detalle: {
              type: "string",
              description: "Una frase con el porqué y el impacto, en español rioplatense.",
            },
            prioridad: { type: "integer", description: "1 (alta) a 100 (baja)." },
            impacto_estimado: {
              type: ["number", "null"],
              description: "Impacto económico estimado en pesos, si aplica.",
            },
            cliente_ids: {
              type: ["array", "null"],
              items: { type: "string" },
              description: "IDs de clientes referidos (de los provistos en el contexto).",
            },
          },
          required: ["categoria", "titulo", "detalle", "prioridad"],
        },
      },
    },
    required: ["recomendaciones"],
  },
};

const SYSTEM = `Sos el analista comercial de Distro. A partir de métricas ya calculadas,
generás recomendaciones ACCIONABLES, no métricas. Cada recomendación es una acción
que el equipo puede ejecutar hoy. Agrupá en: recuperacion (clientes en riesgo/dormidos),
crecimiento (cross/up-sell, zonas con potencial), cobertura (aprovechar rutas) y
alerta (caídas anómalas). Priorizá por impacto económico. Usá los cliente_ids provistos.
No inventes datos que no estén en el contexto. Respondé SIEMPRE invocando la herramienta.`;

/**
 * Genera recomendaciones con la API de Anthropic combinando las métricas del
 * tenant, y las cachea en la tabla `recomendaciones` (reemplaza las previas).
 */
export async function generarRecomendaciones(
  client: SupabaseClient<TenantDatabase>,
): Promise<RecoGenerada[]> {
  const contexto = await construirContexto(client);

  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: `Contexto de la operación (JSON):\n${JSON.stringify(contexto)}`,
      },
    ],
  });

  const toolUse = msg.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("[ai] El modelo no devolvió recomendaciones.");
  }
  const recos = (toolUse.input as { recomendaciones: RecoGenerada[] })
    .recomendaciones;

  // Cachear: limpiar previas e insertar nuevas.
  await client.from("recomendaciones").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (recos.length > 0) {
    const { error } = await client.from("recomendaciones").insert(
      recos.map((r) => ({
        categoria: r.categoria,
        titulo: r.titulo,
        detalle: r.detalle,
        prioridad: r.prioridad,
        impacto_estimado: r.impacto_estimado ?? null,
        cliente_ids: r.cliente_ids ?? null,
        generada_at: new Date().toISOString(),
      })),
    );
    if (error) throw new Error(`[ai] cacheando recomendaciones: ${error.message}`);
  }

  return recos;
}
