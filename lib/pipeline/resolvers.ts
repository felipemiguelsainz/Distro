/**
 * Resolvers cacheados de vendedores y rubros durante una carga.
 * Crecen el catálogo automáticamente cuando aparecen nombres nuevos.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TenantDatabase } from "@/lib/supabase/types";
import { normalizarNombre } from "./clean";

export class VendedorResolver {
  private porNombre = new Map<string, string>();
  private cargado = false;

  constructor(private supabase: SupabaseClient<TenantDatabase>) {}

  async cargar(): Promise<void> {
    if (this.cargado) return;
    const { data, error } = await this.supabase
      .from("vendedores")
      .select("id, nombre");
    if (error) throw new Error(`[resolvers] vendedores: ${error.message}`);
    for (const v of data ?? []) {
      this.porNombre.set(normalizarNombre(v.nombre), v.id);
    }
    this.cargado = true;
  }

  /** Resuelve por nombre; crea el vendedor si no existe. Null si no hay nombre. */
  async resolver(
    nombre: string | null,
    codigo: string | null,
  ): Promise<string | null> {
    const etiqueta = nombre ?? codigo;
    if (!etiqueta) return null;
    const key = normalizarNombre(etiqueta);
    const found = this.porNombre.get(key);
    if (found) return found;

    const { data, error } = await this.supabase
      .from("vendedores")
      .insert({ nombre: etiqueta, activo: true })
      .select("id")
      .single();
    if (error || !data) throw new Error(`[resolvers] creando vendedor: ${error?.message}`);
    this.porNombre.set(key, data.id);
    return data.id;
  }
}

export class RubroResolver {
  private porNombre = new Map<string, string>();
  private cargado = false;

  constructor(private supabase: SupabaseClient<TenantDatabase>) {}

  async cargar(): Promise<void> {
    if (this.cargado) return;
    const { data, error } = await this.supabase.from("rubros").select("id, nombre");
    if (error) throw new Error(`[resolvers] rubros: ${error.message}`);
    for (const r of data ?? []) {
      this.porNombre.set(normalizarNombre(r.nombre), r.id);
    }
    this.cargado = true;
  }

  async resolver(categoria: string | null): Promise<string | null> {
    if (!categoria) return null;
    const key = normalizarNombre(categoria);
    const found = this.porNombre.get(key);
    if (found) return found;

    const { data, error } = await this.supabase
      .from("rubros")
      .insert({ nombre: categoria, activo: true })
      .select("id")
      .single();
    if (error || !data) throw new Error(`[resolvers] creando rubro: ${error?.message}`);
    this.porNombre.set(key, data.id);
    return data.id;
  }
}
