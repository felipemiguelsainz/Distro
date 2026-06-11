/**
 * Tipos del schema estándar de Distro (presente en CADA Supabase de cliente).
 *
 * Estos tipos describen las tablas que viven dentro de la Supabase de un tenant.
 * La Supabase MAESTRA tiene su propio tipo (`MasterDatabase`) más abajo.
 *
 * Nota: mantener en sync con `supabase/tenant/schema.sql`.
 */

export type SaleType = "venta" | "devolucion" | "nota_credito";

export type Segmento =
  | "estrella"
  | "crecimiento"
  | "estable"
  | "riesgo"
  | "dormido";

export type TransformacionMapeo =
  | "none"
  | "fecha"
  | "monto"
  | "uppercase"
  | "trim"
  | "tipo_venta";

export type UploadStatus =
  | "pending"
  | "mapping"
  | "processing"
  | "completed"
  | "failed";

export type UserRole = "super_admin" | "admin" | "supervisor" | "vendedor";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface Rubro {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface Equipo {
  id: string;
  nombre: string;
}

export interface Vendedor {
  id: string;
  nombre: string;
  equipo_id: string | null;
  activo: boolean;
  /** auth.users.id del vendedor, para RLS por cartera. */
  auth_user_id: string | null;
}

export interface Cliente {
  id: string;
  nombre_normalizado: string;
  codigo_externo: string | null;
  zona: string | null;
  activo: boolean;
}

export interface Pdv {
  id: string;
  nombre: string;
  cliente_id: string | null;
  vendedor_id: string | null;
  lat: number | null;
  lon: number | null;
  activo: boolean;
}

export interface ColumnMapping {
  id: string;
  /** Campo canónico de Distro, p.ej. "fecha_venta", "monto". */
  campo_distro: string;
  /** Nombre exacto de la columna en el Excel del cliente. */
  columna_excel: string;
  tipo_transformacion: TransformacionMapeo;
}

export interface Upload {
  id: string;
  filename: string;
  status: UploadStatus;
  uploaded_at: string;
  rows_procesadas: number;
  errores: UploadError[] | null;
}

export interface UploadError {
  row: number;
  campo: string;
  valor: unknown;
  motivo: string;
}

export interface StagingVenta {
  id: string;
  upload_id: string;
  raw_data: Record<string, unknown>;
  procesado: boolean;
}

export interface Venta {
  id: string;
  fecha: string; // ISO date
  cliente_id: string;
  vendedor_id: string | null;
  rubro_id: string | null;
  monto: number;
  tipo: SaleType;
  /** Hash de dedupe (upload_row signature) para cargas incrementales. */
  dedupe_hash: string | null;
}

export interface ResumenDiario {
  id: string;
  fecha: string;
  vendedor_id: string | null;
  rubro_id: string | null;
  monto: number;
  visitas: number;
}

export interface ClienteMetricas {
  id: string;
  cliente_id: string;
  ultima_compra: string | null;
  frecuencia_promedio_dias: number | null;
  monto_promedio: number | null;
  monto_ultimos_3m: number | null;
  monto_mismo_mes_ano_anterior: number | null;
  score_salud: number | null;
  segmento: Segmento | null;
  proxima_compra_estimada: string | null;
  dias_sin_compra: number | null;
  actualizado_at: string;
}

export interface Meta {
  id: string;
  equipo_id: string;
  periodo: string; // YYYY-MM
  /** CCC = Cobertura de Clientes Compradores (clientes únicos objetivo). */
  ccc_objetivo: number;
  facturacion_objetivo: number | null;
}

export interface AppUser {
  id: string;
  auth_user_id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  equipo_id: string | null;
  vendedor_id: string | null;
  activo: boolean;
}

export interface Recomendacion {
  id: string;
  categoria: "recuperacion" | "crecimiento" | "cobertura" | "alerta";
  titulo: string;
  detalle: string;
  prioridad: number;
  impacto_estimado: number | null;
  cliente_ids: string[] | null;
  generada_at: string;
}

// ---------------------------------------------------------------------------
// Tenant Database type (shape consumido por supabase-js)
// ---------------------------------------------------------------------------

// supabase-js exige que Row/Insert/Update sean asignables a Record<string,
// unknown> (GenericTable). Las interfaces no traen index signature implícita,
// así que las intersectamos para satisfacer la restricción sin perder tipado.
type Indexable<T> = T & Record<string, unknown>;

type Table<Row> = {
  Row: Indexable<Row>;
  Insert: Indexable<Partial<Row>>;
  Update: Indexable<Partial<Row>>;
  Relationships: [];
};

type Schema<T extends Record<string, { Row: object }>> = {
  Tables: T;
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
};

export interface TenantDatabase {
  public: Schema<{
    rubros: Table<Rubro>;
    equipos: Table<Equipo>;
    vendedores: Table<Vendedor>;
    clientes: Table<Cliente>;
    pdvs: Table<Pdv>;
    column_mappings: Table<ColumnMapping>;
    uploads: Table<Upload>;
    staging_ventas: Table<StagingVenta>;
    ventas: Table<Venta>;
    resumen_diario: Table<ResumenDiario>;
    cliente_metricas: Table<ClienteMetricas>;
    metas: Table<Meta>;
    app_users: Table<AppUser>;
    recomendaciones: Table<Recomendacion>;
  }>;
}

// ---------------------------------------------------------------------------
// Master Database type (control plane)
// ---------------------------------------------------------------------------

export interface TenantRecord {
  id: string;
  slug: string;
  nombre: string;
  supabase_url: string;
  supabase_anon_key: string;
  /** Solo se lee server-side. Permite operaciones admin sobre el tenant. */
  supabase_service_role_key: string | null;
  modulos_activos: string[];
  activo: boolean;
  created_at: string;
}

export interface MasterDatabase {
  public: Schema<{
    tenants: Table<TenantRecord>;
  }>;
}

export type DistroModule =
  | "analytics"
  | "intelligence"
  | "rutas"
  | "metas"
  | "chat";
