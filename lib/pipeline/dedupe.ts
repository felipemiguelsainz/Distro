/**
 * Resolución y deduplicación de clientes entre cargas.
 *
 * Un mismo cliente puede venir con distintos IDs en cargas diferentes; lo
 * unificamos por (nombre_normalizado + zona) y, si existe, por codigo_externo.
 *
 * El resolver cachea los clientes en memoria durante una carga para evitar
 * un round-trip por fila.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Cliente, TenantDatabase } from "@/lib/supabase/types";
import { normalizarNombre } from "./clean";

interface ClienteInput {
  nombre: string;
  zona: string | null;
  codigoExterno: string | null;
}

function claveMatch(nombreNorm: string, zona: string | null): string {
  return `${nombreNorm}|${(zona ?? "").toLowerCase().trim()}`;
}

export class ClienteResolver {
  private porCodigo = new Map<string, string>(); // codigo_externo → cliente_id
  private porMatch = new Map<string, string>(); // nombre|zona → cliente_id
  private cargado = false;

  constructor(private supabase: SupabaseClient<TenantDatabase>) {}

  /** Precarga los clientes existentes en memoria. */
  async cargar(): Promise<void> {
    if (this.cargado) return;
    const pageSize = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await this.supabase
        .from("clientes")
        .select("id, nombre_normalizado, codigo_externo, zona")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`[dedupe] cargando clientes: ${error.message}`);
      const rows = (data ?? []) as Pick<
        Cliente,
        "id" | "nombre_normalizado" | "codigo_externo" | "zona"
      >[];
      for (const c of rows) {
        if (c.codigo_externo) this.porCodigo.set(c.codigo_externo, c.id);
        this.porMatch.set(claveMatch(c.nombre_normalizado, c.zona), c.id);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    this.cargado = true;
  }

  /**
   * Devuelve el cliente_id existente para el input, o null si es nuevo.
   * Prioridad: código externo > (nombre normalizado + zona).
   */
  resolver(input: ClienteInput): string | null {
    if (input.codigoExterno) {
      const byCodigo = this.porCodigo.get(input.codigoExterno);
      if (byCodigo) return byCodigo;
    }
    const nombreNorm = normalizarNombre(input.nombre);
    return this.porMatch.get(claveMatch(nombreNorm, input.zona)) ?? null;
  }

  /**
   * Resuelve o crea el cliente y devuelve su id. Registra el nuevo cliente en
   * los índices en memoria para que la misma carga lo reutilice.
   */
  async resolverOCrear(input: ClienteInput): Promise<string> {
    const existente = this.resolver(input);
    if (existente) {
      // Si vino código nuevo para un cliente ya conocido, lo backfilleamos.
      if (input.codigoExterno && !this.porCodigo.has(input.codigoExterno)) {
        this.porCodigo.set(input.codigoExterno, existente);
        await this.supabase
          .from("clientes")
          .update({ codigo_externo: input.codigoExterno })
          .eq("id", existente)
          .is("codigo_externo", null);
      }
      return existente;
    }

    const nombreNorm = normalizarNombre(input.nombre);
    const { data, error } = await this.supabase
      .from("clientes")
      .insert({
        nombre_normalizado: nombreNorm,
        codigo_externo: input.codigoExterno,
        zona: input.zona,
        activo: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`[dedupe] creando cliente: ${error?.message}`);
    }
    if (input.codigoExterno) this.porCodigo.set(input.codigoExterno, data.id);
    this.porMatch.set(claveMatch(nombreNorm, input.zona), data.id);
    return data.id;
  }
}
