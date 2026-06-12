-- ===========================================================================
-- Distro — Schema estándar del TENANT (se aplica idéntico en cada Supabase
-- de cliente). Datos aislados por proyecto Supabase + RLS por rol.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type sale_type as enum ('venta', 'devolucion', 'nota_credito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type segmento as enum ('estrella', 'crecimiento', 'estable', 'riesgo', 'dormido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('super_admin', 'admin', 'supervisor', 'vendedor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type upload_status as enum ('pending', 'mapping', 'processing', 'completed', 'failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Configuración del tenant
-- ---------------------------------------------------------------------------
create table if not exists public.rubros (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null,
  activo  boolean not null default true
);

create table if not exists public.equipos (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null
);

create table if not exists public.vendedores (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  equipo_id     uuid references public.equipos(id) on delete set null,
  activo        boolean not null default true,
  auth_user_id  uuid  -- vincula al usuario auth para RLS por cartera
);
create index if not exists vendedores_equipo_idx on public.vendedores (equipo_id);
create index if not exists vendedores_auth_idx on public.vendedores (auth_user_id);

create table if not exists public.clientes (
  id                  uuid primary key default gen_random_uuid(),
  nombre_normalizado  text not null,
  codigo_externo      text,
  zona                text,
  activo              boolean not null default true
);
create index if not exists clientes_codigo_idx on public.clientes (codigo_externo);
-- Para matching de dedupe por (nombre normalizado + zona)
create index if not exists clientes_match_idx on public.clientes (nombre_normalizado, zona);

create table if not exists public.pdvs (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  cliente_id  uuid references public.clientes(id) on delete cascade,
  vendedor_id uuid references public.vendedores(id) on delete set null,
  lat         double precision,
  lon         double precision,
  activo      boolean not null default true
);
create index if not exists pdvs_vendedor_idx on public.pdvs (vendedor_id);

-- ---------------------------------------------------------------------------
-- Usuarios de la aplicación (rol + scoping). auth.users es la fuente de auth.
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique,
  nombre        text not null,
  email         text not null,
  rol           user_role not null default 'vendedor',
  equipo_id     uuid references public.equipos(id) on delete set null,
  vendedor_id   uuid references public.vendedores(id) on delete set null,
  activo        boolean not null default true
);
create index if not exists app_users_auth_idx on public.app_users (auth_user_id);

-- ---------------------------------------------------------------------------
-- Mapeo de columnas del Excel
-- ---------------------------------------------------------------------------
create table if not exists public.column_mappings (
  id                  uuid primary key default gen_random_uuid(),
  campo_distro        text not null,
  columna_excel       text not null,
  tipo_transformacion text not null default 'none',
  unique (campo_distro)
);

-- ---------------------------------------------------------------------------
-- Pipeline de carga
-- ---------------------------------------------------------------------------
create table if not exists public.uploads (
  id              uuid primary key default gen_random_uuid(),
  filename        text not null,
  status          upload_status not null default 'pending',
  uploaded_at     timestamptz not null default now(),
  rows_procesadas integer not null default 0,
  errores         jsonb
);

create table if not exists public.staging_ventas (
  id         uuid primary key default gen_random_uuid(),
  upload_id  uuid not null references public.uploads(id) on delete cascade,
  raw_data   jsonb not null,
  procesado  boolean not null default false
);
create index if not exists staging_upload_idx on public.staging_ventas (upload_id, procesado);

-- ---------------------------------------------------------------------------
-- Datos normalizados
-- ---------------------------------------------------------------------------
create table if not exists public.ventas (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  cliente_id   uuid not null references public.clientes(id) on delete cascade,
  vendedor_id  uuid references public.vendedores(id) on delete set null,
  rubro_id     uuid references public.rubros(id) on delete set null,
  monto        numeric(14,2) not null,
  tipo         sale_type not null default 'venta',
  -- Firma de la fila de origen para deduplicación en cargas incrementales.
  dedupe_hash  text unique
);
create index if not exists ventas_fecha_idx on public.ventas (fecha);
create index if not exists ventas_cliente_idx on public.ventas (cliente_id, fecha);
create index if not exists ventas_vendedor_idx on public.ventas (vendedor_id, fecha);
create index if not exists ventas_rubro_idx on public.ventas (rubro_id, fecha);

-- ---------------------------------------------------------------------------
-- Tablas analíticas precalculadas (recálculo incremental)
-- ---------------------------------------------------------------------------
create table if not exists public.resumen_diario (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  vendedor_id uuid references public.vendedores(id) on delete cascade,
  rubro_id    uuid references public.rubros(id) on delete cascade,
  monto       numeric(14,2) not null default 0,
  visitas     integer not null default 0,
  unique (fecha, vendedor_id, rubro_id)
);
create index if not exists resumen_fecha_idx on public.resumen_diario (fecha);

create table if not exists public.cliente_metricas (
  id                            uuid primary key default gen_random_uuid(),
  cliente_id                    uuid not null unique references public.clientes(id) on delete cascade,
  ultima_compra                 date,
  frecuencia_promedio_dias      numeric(8,2),
  monto_promedio                numeric(14,2),
  monto_ultimos_3m              numeric(14,2),
  monto_mismo_mes_ano_anterior  numeric(14,2),
  score_salud                   integer,
  segmento                      segmento,
  proxima_compra_estimada       date,
  dias_sin_compra               integer,
  actualizado_at                timestamptz not null default now()
);
create index if not exists cliente_metricas_segmento_idx on public.cliente_metricas (segmento);
create index if not exists cliente_metricas_score_idx on public.cliente_metricas (score_salud);

-- ---------------------------------------------------------------------------
-- Metas (CCC = Cobertura de Clientes Compradores)
-- ---------------------------------------------------------------------------
create table if not exists public.metas (
  id                    uuid primary key default gen_random_uuid(),
  equipo_id             uuid not null references public.equipos(id) on delete cascade,
  periodo               text not null,  -- 'YYYY-MM'
  ccc_objetivo          integer not null default 0,
  facturacion_objetivo  numeric(14,2),
  unique (equipo_id, periodo)
);

-- ---------------------------------------------------------------------------
-- Recomendaciones del Centro de IA (cacheadas, regeneradas por carga)
-- ---------------------------------------------------------------------------
create table if not exists public.recomendaciones (
  id                uuid primary key default gen_random_uuid(),
  categoria         text not null,  -- recuperacion | crecimiento | cobertura | alerta
  titulo            text not null,
  detalle           text not null,
  prioridad         integer not null default 0,
  impacto_estimado  numeric(14,2),
  cliente_ids       uuid[],
  generada_at       timestamptz not null default now()
);
create index if not exists recomendaciones_prioridad_idx on public.recomendaciones (prioridad desc);

-- ---------------------------------------------------------------------------
-- Alertas diarias (generadas por la Edge Function `alertas-diarias` y enviadas
-- por email a supervisores/admins). El recálculo nunca las toca.
-- ---------------------------------------------------------------------------
create table if not exists public.alertas (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,
  -- 'vendedor_caida' | 'cliente_sin_compra' | 'ccc_bajo' | 'facturacion_caida'
  titulo      text not null,
  detalle     text not null,
  severidad   text not null default 'media', -- 'alta' | 'media' | 'baja'
  leida       boolean not null default false,
  enviada     boolean not null default false,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists alertas_created_idx on public.alertas (created_at desc);
create index if not exists alertas_no_leidas_idx on public.alertas (leida) where not leida;
