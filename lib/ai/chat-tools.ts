import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantDatabase } from "@/lib/supabase/types";

/**
 * Registro de herramientas del chat. CADA herramienta mapea 1:1 a una función
 * RPC predefinida en la Supabase del tenant. El modelo NUNCA genera SQL: solo
 * puede invocar estas funciones, que además corren con la RLS del usuario.
 */
interface ChatTool {
  definition: Anthropic.Tool;
  rpc: string;
  /** Mapea el input del modelo a los parámetros de la RPC. */
  buildParams: (input: Record<string, unknown>) => Record<string, unknown>;
}

const TOOLS: ChatTool[] = [
  {
    rpc: "distro_kpis",
    buildParams: (i) => ({ periodo: (i.periodo as string) ?? null }),
    definition: {
      name: "kpis",
      description:
        "KPIs de un período (facturación, CCC, visitas, devoluciones). Período 'YYYY-MM' o null para el mes actual.",
      input_schema: {
        type: "object",
        properties: { periodo: { type: ["string", "null"] } },
      },
    },
  },
  {
    rpc: "distro_clientes_en_riesgo",
    buildParams: (i) => ({ max_filas: (i.max_filas as number) ?? 20 }),
    definition: {
      name: "clientes_en_riesgo",
      description: "Lista priorizada de clientes en riesgo o dormidos.",
      input_schema: {
        type: "object",
        properties: { max_filas: { type: "integer" } },
      },
    },
  },
  {
    rpc: "distro_compras_vencidas",
    buildParams: () => ({}),
    definition: {
      name: "compras_vencidas",
      description:
        "Clientes que ya superaron su fecha estimada de próxima compra.",
      input_schema: { type: "object", properties: {} },
    },
  },
  {
    rpc: "distro_top_clientes",
    buildParams: (i) => ({
      periodo: (i.periodo as string) ?? null,
      max_filas: (i.max_filas as number) ?? 10,
    }),
    definition: {
      name: "top_clientes",
      description: "Top clientes por facturación en un período.",
      input_schema: {
        type: "object",
        properties: {
          periodo: { type: ["string", "null"] },
          max_filas: { type: "integer" },
        },
      },
    },
  },
  {
    rpc: "distro_ventas_por_rubro",
    buildParams: (i) => ({
      desde: (i.desde as string) ?? null,
      hasta: (i.hasta as string) ?? null,
    }),
    definition: {
      name: "ventas_por_rubro",
      description:
        "Facturación y unidades por rubro entre dos fechas (ISO). Null = últimos 90 días.",
      input_schema: {
        type: "object",
        properties: {
          desde: { type: ["string", "null"] },
          hasta: { type: ["string", "null"] },
        },
      },
    },
  },
  {
    rpc: "distro_segmentos_resumen",
    buildParams: () => ({}),
    definition: {
      name: "segmentos_resumen",
      description: "Cantidad de clientes y monto promedio por segmento RFM.",
      input_schema: { type: "object", properties: {} },
    },
  },
];

export const TOOL_DEFINITIONS: Anthropic.Tool[] = TOOLS.map((t) => t.definition);

const PORTOOL = new Map(TOOLS.map((t) => [t.definition.name, t]));

/**
 * Ejecuta la herramienta solicitada por el modelo invocando su RPC asociada.
 * Si el nombre no está registrado, devuelve error (defensa: nada de SQL libre).
 */
export async function ejecutarTool(
  client: SupabaseClient<TenantDatabase>,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const tool = PORTOOL.get(name);
  if (!tool) {
    return { error: `Herramienta desconocida: ${name}` };
  }
  const params = tool.buildParams(input ?? {});
  const { data, error } = await client.rpc(tool.rpc as never, params as never);
  if (error) return { error: error.message };
  return data;
}
