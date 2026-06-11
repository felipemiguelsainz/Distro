-- ===========================================================================
-- Distro — Supabase MAESTRA (control plane)
-- ===========================================================================
-- Guarda el catálogo de tenants y sus credenciales. NUNCA se expone al browser:
-- el acceso ocurre solo server-side con el service role. RLS deniega todo a la
-- anon key como capa extra de defensa.
-- ===========================================================================

create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id                          uuid primary key default gen_random_uuid(),
  slug                        text not null unique,
  nombre                      text not null,
  supabase_url                text not null,
  supabase_anon_key           text not null,
  -- Service role del tenant. Solo lo lee el server de Distro para operaciones
  -- de pipeline / recálculo. Considerar cifrado en reposo (pgsodium/Vault).
  supabase_service_role_key   text,
  modulos_activos             text[] not null default '{}',
  activo                      boolean not null default true,
  created_at                  timestamptz not null default now()
);

create index if not exists tenants_slug_idx on public.tenants (slug);

-- ---------------------------------------------------------------------------
-- RLS: bloquear todo acceso por anon/authenticated. Solo service role pasa
-- (el service role bypassa RLS por diseño).
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;

drop policy if exists "deny all" on public.tenants;
create policy "deny all" on public.tenants
  for all
  using (false)
  with check (false);
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
-- ===========================================================================
-- Distro — RLS del TENANT. Enforcea aislamiento por rol en cada query.
--
-- Roles:
--   super_admin / admin  → acceso total dentro del tenant
--   supervisor           → su equipo (ve y edita metas de su equipo)
--   vendedor             → solo su cartera (sus clientes/pdvs/ventas)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helpers: leen el perfil del usuario actual desde app_users.
-- SECURITY DEFINER para poder leerse a sí mismas sin recursión de políticas.
-- ---------------------------------------------------------------------------
create or replace function public.current_rol()
returns user_role
language sql stable security definer set search_path = public as $$
  select rol from public.app_users where auth_user_id = auth.uid() and activo limit 1;
$$;

create or replace function public.current_equipo()
returns uuid
language sql stable security definer set search_path = public as $$
  select equipo_id from public.app_users where auth_user_id = auth.uid() and activo limit 1;
$$;

create or replace function public.current_vendedor()
returns uuid
language sql stable security definer set search_path = public as $$
  select vendedor_id from public.app_users where auth_user_id = auth.uid() and activo limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_rol() in ('super_admin', 'admin');
$$;

create or replace function public.is_supervisor()
returns boolean
language sql stable as $$ select public.current_rol() = 'supervisor'; $$;

-- ---------------------------------------------------------------------------
-- Habilitar RLS en todas las tablas
-- ---------------------------------------------------------------------------
alter table public.rubros            enable row level security;
alter table public.equipos           enable row level security;
alter table public.vendedores        enable row level security;
alter table public.clientes          enable row level security;
alter table public.pdvs              enable row level security;
alter table public.app_users         enable row level security;
alter table public.column_mappings   enable row level security;
alter table public.uploads           enable row level security;
alter table public.staging_ventas    enable row level security;
alter table public.ventas            enable row level security;
alter table public.resumen_diario    enable row level security;
alter table public.cliente_metricas  enable row level security;
alter table public.metas             enable row level security;
alter table public.recomendaciones   enable row level security;

-- ---------------------------------------------------------------------------
-- app_users: cada uno se ve a sí mismo; admin ve y gestiona a todos.
-- ---------------------------------------------------------------------------
drop policy if exists app_users_self on public.app_users;
create policy app_users_self on public.app_users
  for select using (auth_user_id = auth.uid() or public.is_admin());

drop policy if exists app_users_admin_write on public.app_users;
create policy app_users_admin_write on public.app_users
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Catálogos de configuración: lectura para todos los autenticados,
-- escritura solo admin. (rubros, equipos, column_mappings)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rubros', 'equipos', 'column_mappings'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format(
      'create policy %1$s_read on public.%1$s for select using (auth.uid() is not null)', t);
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_admin on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- vendedores: admin todo; supervisor su equipo; vendedor solo a sí mismo.
-- ---------------------------------------------------------------------------
drop policy if exists vendedores_scope on public.vendedores;
create policy vendedores_scope on public.vendedores
  for select using (
    public.is_admin()
    or (public.is_supervisor() and equipo_id = public.current_equipo())
    or id = public.current_vendedor()
  );
drop policy if exists vendedores_admin on public.vendedores;
create policy vendedores_admin on public.vendedores
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- clientes: admin todo; supervisor/vendedor ven los clientes alcanzados por
-- sus PDVs (cartera). Determinado vía pdvs.vendedor_id.
-- ---------------------------------------------------------------------------
drop policy if exists clientes_scope on public.clientes;
create policy clientes_scope on public.clientes
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.pdvs p
      join public.vendedores v on v.id = p.vendedor_id
      where p.cliente_id = clientes.id
        and (
          (public.is_supervisor() and v.equipo_id = public.current_equipo())
          or v.id = public.current_vendedor()
        )
    )
  );
drop policy if exists clientes_admin on public.clientes;
create policy clientes_admin on public.clientes
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- pdvs: admin todo; supervisor su equipo; vendedor su cartera.
-- ---------------------------------------------------------------------------
drop policy if exists pdvs_scope on public.pdvs;
create policy pdvs_scope on public.pdvs
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.vendedores v
      where v.id = pdvs.vendedor_id
        and (
          (public.is_supervisor() and v.equipo_id = public.current_equipo())
          or v.id = public.current_vendedor()
        )
    )
  );
drop policy if exists pdvs_admin on public.pdvs;
create policy pdvs_admin on public.pdvs
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- ventas: admin todo; supervisor por equipo (vendedor.equipo); vendedor propio.
-- ---------------------------------------------------------------------------
drop policy if exists ventas_scope on public.ventas;
create policy ventas_scope on public.ventas
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.vendedores v
      where v.id = ventas.vendedor_id
        and (
          (public.is_supervisor() and v.equipo_id = public.current_equipo())
          or v.id = public.current_vendedor()
        )
    )
  );
drop policy if exists ventas_admin on public.ventas;
create policy ventas_admin on public.ventas
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- cliente_metricas: visibles si el cliente lo es para el usuario.
-- ---------------------------------------------------------------------------
drop policy if exists cliente_metricas_scope on public.cliente_metricas;
create policy cliente_metricas_scope on public.cliente_metricas
  for select using (
    public.is_admin()
    or exists (select 1 from public.clientes c where c.id = cliente_metricas.cliente_id)
  );
drop policy if exists cliente_metricas_admin on public.cliente_metricas;
create policy cliente_metricas_admin on public.cliente_metricas
  for all using (public.is_admin()) with check (public.is_admin());

-- resumen_diario: mismo scope que ventas (por vendedor/equipo).
drop policy if exists resumen_scope on public.resumen_diario;
create policy resumen_scope on public.resumen_diario
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.vendedores v
      where v.id = resumen_diario.vendedor_id
        and (
          (public.is_supervisor() and v.equipo_id = public.current_equipo())
          or v.id = public.current_vendedor()
        )
    )
  );
drop policy if exists resumen_admin on public.resumen_diario;
create policy resumen_admin on public.resumen_diario
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- metas: lectura admin/supervisor; el supervisor puede EDITAR la meta de CCC
-- de SU equipo. Admin edita cualquiera.
-- ---------------------------------------------------------------------------
drop policy if exists metas_read on public.metas;
create policy metas_read on public.metas
  for select using (
    public.is_admin()
    or (public.is_supervisor() and equipo_id = public.current_equipo())
  );

drop policy if exists metas_admin on public.metas;
create policy metas_admin on public.metas
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists metas_supervisor_update on public.metas;
create policy metas_supervisor_update on public.metas
  for update
  using (public.is_supervisor() and equipo_id = public.current_equipo())
  with check (public.is_supervisor() and equipo_id = public.current_equipo());

drop policy if exists metas_supervisor_insert on public.metas;
create policy metas_supervisor_insert on public.metas
  for insert
  with check (public.is_supervisor() and equipo_id = public.current_equipo());

-- ---------------------------------------------------------------------------
-- uploads / staging_ventas / recomendaciones: solo admin (operación de tenant).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['uploads', 'staging_ventas'] loop
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format(
      'create policy %1$s_admin on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists recomendaciones_read on public.recomendaciones;
create policy recomendaciones_read on public.recomendaciones
  for select using (auth.uid() is not null);
drop policy if exists recomendaciones_admin on public.recomendaciones;
create policy recomendaciones_admin on public.recomendaciones
  for all using (public.is_admin()) with check (public.is_admin());
-- ===========================================================================
-- Distro — Funciones RPC predefinidas.
--
-- El chat con IA NUNCA ejecuta SQL libre: el modelo solo puede invocar estas
-- funciones mediante tool-use. Son SECURITY INVOKER => respetan la RLS del rol
-- del usuario que pregunta. Cada parámetro está tipado y acotado.
-- ===========================================================================

-- KPIs principales de un período 'YYYY-MM' (o el mes actual si null).
create or replace function public.distro_kpis(periodo text default null)
returns table (
  facturacion   numeric,
  ccc           bigint,    -- clientes únicos compradores
  visitas       bigint,
  devoluciones  numeric
)
language sql stable security invoker as $$
  with rango as (
    select
      coalesce(to_date(periodo, 'YYYY-MM'), date_trunc('month', current_date)::date) as desde
  ),
  r as (
    select desde, (desde + interval '1 month')::date as hasta from rango
  )
  select
    coalesce(sum(v.monto) filter (where v.tipo = 'venta'), 0) as facturacion,
    count(distinct v.cliente_id) filter (where v.tipo = 'venta') as ccc,
    count(*) filter (where v.tipo = 'venta') as visitas,
    coalesce(abs(sum(v.monto) filter (where v.tipo <> 'venta')), 0) as devoluciones
  from public.ventas v, r
  where v.fecha >= r.desde and v.fecha < r.hasta;
$$;

-- Clientes en riesgo: score bajo o compra vencida, priorizados.
create or replace function public.distro_clientes_en_riesgo(max_filas integer default 20)
returns table (
  cliente_id      uuid,
  nombre          text,
  zona            text,
  score_salud     integer,
  dias_sin_compra integer,
  monto_promedio  numeric,
  segmento        segmento
)
language sql stable security invoker as $$
  select
    c.id, c.nombre_normalizado, c.zona,
    m.score_salud, m.dias_sin_compra, m.monto_promedio, m.segmento
  from public.cliente_metricas m
  join public.clientes c on c.id = m.cliente_id
  where m.segmento in ('riesgo', 'dormido')
     or (m.proxima_compra_estimada is not null and m.proxima_compra_estimada < current_date)
  order by m.score_salud asc nulls last, m.monto_promedio desc nulls last
  limit greatest(1, least(max_filas, 200));
$$;

-- Clientes que superaron el plazo esperado de compra.
create or replace function public.distro_compras_vencidas()
returns table (
  cliente_id              uuid,
  nombre                  text,
  proxima_compra_estimada date,
  dias_vencido            integer
)
language sql stable security invoker as $$
  select
    c.id, c.nombre_normalizado, m.proxima_compra_estimada,
    (current_date - m.proxima_compra_estimada) as dias_vencido
  from public.cliente_metricas m
  join public.clientes c on c.id = m.cliente_id
  where m.proxima_compra_estimada is not null
    and m.proxima_compra_estimada < current_date
  order by dias_vencido desc;
$$;

-- Top clientes por facturación en un período.
create or replace function public.distro_top_clientes(
  periodo text default null,
  max_filas integer default 10
)
returns table (cliente_id uuid, nombre text, facturacion numeric)
language sql stable security invoker as $$
  with r as (
    select
      coalesce(to_date(periodo, 'YYYY-MM'), date_trunc('month', current_date)::date) as desde,
      (coalesce(to_date(periodo, 'YYYY-MM'), date_trunc('month', current_date)::date)
        + interval '1 month')::date as hasta
  )
  select c.id, c.nombre_normalizado, sum(v.monto) as facturacion
  from public.ventas v
  join public.clientes c on c.id = v.cliente_id, r
  where v.tipo = 'venta' and v.fecha >= r.desde and v.fecha < r.hasta
  group by c.id, c.nombre_normalizado
  order by facturacion desc
  limit greatest(1, least(max_filas, 100));
$$;

-- Facturación por rubro en un rango de fechas.
create or replace function public.distro_ventas_por_rubro(
  desde date default null,
  hasta date default null
)
returns table (rubro_id uuid, rubro text, facturacion numeric, unidades bigint)
language sql stable security invoker as $$
  select
    ru.id, ru.nombre,
    coalesce(sum(v.monto) filter (where v.tipo = 'venta'), 0),
    count(*) filter (where v.tipo = 'venta')
  from public.rubros ru
  left join public.ventas v on v.rubro_id = ru.id
    and v.fecha >= coalesce(desde, current_date - interval '90 days')
    and v.fecha <  coalesce(hasta, current_date + interval '1 day')
  group by ru.id, ru.nombre
  order by 3 desc;
$$;

-- Resumen de segmentos RFM (conteo y monto por segmento).
create or replace function public.distro_segmentos_resumen()
returns table (segmento segmento, clientes bigint, monto_promedio numeric)
language sql stable security invoker as $$
  select m.segmento, count(*), avg(m.monto_promedio)
  from public.cliente_metricas m
  where m.segmento is not null
  group by m.segmento
  order by 2 desc;
$$;

-- Avance de CCC vs meta para un equipo en el período actual.
create or replace function public.distro_avance_ccc(p_equipo_id uuid, periodo text default null)
returns table (ccc_actual bigint, ccc_objetivo integer, avance_pct numeric)
language sql stable security invoker as $$
  with r as (
    select
      coalesce(to_date(periodo, 'YYYY-MM'), date_trunc('month', current_date)::date) as desde,
      (coalesce(to_date(periodo, 'YYYY-MM'), date_trunc('month', current_date)::date)
        + interval '1 month')::date as hasta,
      coalesce(periodo, to_char(current_date, 'YYYY-MM')) as per
  )
  select
    count(distinct v.cliente_id) as ccc_actual,
    coalesce(mt.ccc_objetivo, 0) as ccc_objetivo,
    case when coalesce(mt.ccc_objetivo, 0) = 0 then 0
         else round(100.0 * count(distinct v.cliente_id) / mt.ccc_objetivo, 1) end
  from r
  left join public.vendedores ve on ve.equipo_id = p_equipo_id
  left join public.ventas v on v.vendedor_id = ve.id
    and v.tipo = 'venta' and v.fecha >= r.desde and v.fecha < r.hasta
  left join public.metas mt on mt.equipo_id = p_equipo_id and mt.periodo = r.per
  group by mt.ccc_objetivo;
$$;
-- ===========================================================================
-- Distro — RPCs de agregación para el Dashboard (datos reales).
-- SECURITY INVOKER: respetan la RLS del rol que consulta.
-- Correr en la Supabase del tenant DESPUÉS de schema.sql (o vía bootstrap.sql).
-- ===========================================================================

-- Facturación por (año, mes) de los últimos 3 años.
create or replace function public.distro_facturacion_mensual(anio_base int default null)
returns table (anio int, mes int, monto numeric)
language sql stable security invoker as $$
  with b as (select coalesce(anio_base, extract(year from current_date)::int) as y)
  select extract(year from v.fecha)::int, extract(month from v.fecha)::int,
         coalesce(sum(v.monto) filter (where v.tipo = 'venta'), 0)
  from public.ventas v, b
  where v.fecha >= make_date(b.y - 2, 1, 1) and v.fecha < make_date(b.y + 1, 1, 1)
  group by 1, 2;
$$;

-- CCC (compradores únicos) por mes + cartera activa del año.
create or replace function public.distro_ccc_mensual(anio int default null)
returns table (mes int, ccc bigint, cartera bigint)
language sql stable security invoker as $$
  with b as (select coalesce(anio, extract(year from current_date)::int) as y),
  cart as (
    select count(distinct v.cliente_id) as c
    from public.ventas v, b
    where v.tipo = 'venta'
      and v.fecha >= make_date(b.y, 1, 1) and v.fecha < make_date(b.y + 1, 1, 1)
  )
  select extract(month from v.fecha)::int,
         count(distinct v.cliente_id),
         (select c from cart)
  from public.ventas v, b
  where v.tipo = 'venta'
    and v.fecha >= make_date(b.y, 1, 1) and v.fecha < make_date(b.y + 1, 1, 1)
  group by 1;
$$;

-- KPIs YTD del dashboard.
create or replace function public.distro_dashboard_kpis()
returns table (
  facturacion_ytd      numeric,
  facturacion_ytd_prev numeric,
  ccc_mes              bigint,
  clientes_activos     bigint,
  ticket_promedio      numeric,
  operaciones_ytd      bigint
)
language sql stable security invoker as $$
  with d as (
    select extract(year from current_date)::int as y,
           extract(month from current_date)::int as m
  )
  select
    (select coalesce(sum(monto), 0) from public.ventas v, d
       where v.tipo = 'venta'
         and v.fecha >= make_date(d.y, 1, 1) and v.fecha < make_date(d.y + 1, 1, 1)),
    (select coalesce(sum(monto), 0) from public.ventas v, d
       where v.tipo = 'venta'
         and v.fecha >= make_date(d.y - 1, 1, 1)
         and v.fecha <  make_date(d.y - 1, 1, 1) + (current_date - make_date(d.y, 1, 1))),
    (select count(distinct cliente_id) from public.ventas v, d
       where v.tipo = 'venta'
         and extract(year from v.fecha) = d.y and extract(month from v.fecha) = d.m),
    (select count(*) from public.clientes where activo),
    (select case when count(*) filter (where v.tipo = 'venta') = 0 then 0
        else round(sum(v.monto) filter (where v.tipo = 'venta')
                   / count(*) filter (where v.tipo = 'venta'), 2) end
       from public.ventas v, d where extract(year from v.fecha) = d.y),
    (select count(*) from public.ventas v, d
       where v.tipo = 'venta' and extract(year from v.fecha) = d.y)
  from d;
$$;

-- Tendencia: mismo tramo de días del mes actual vs mes anterior y año anterior.
-- p_dias_transcurridos = días corridos desde el día 1 del mes (define el tramo
-- comparable: [día 1, día 1 + p_dias) en cada período).
create or replace function public.distro_kpis_tendencia(p_dias_transcurridos int)
returns table (
  facturacion_actual   numeric,
  facturacion_mes_ant  numeric,
  facturacion_anio_ant numeric,
  ccc_actual           bigint,
  ccc_mes_ant          bigint,
  ccc_anio_ant         bigint
)
language sql stable security invoker as $$
  with d as (
    select
      date_trunc('month', current_date)::date as m0,
      (date_trunc('month', current_date) - interval '1 month')::date as ma0,
      (date_trunc('month', current_date) - interval '1 year')::date as aa0,
      make_interval(days => greatest(p_dias_transcurridos, 0)) as tramo
  )
  select
    (select coalesce(sum(v.monto), 0) from public.ventas v, d
       where v.tipo = 'venta' and v.fecha >= d.m0  and v.fecha < d.m0  + d.tramo),
    (select coalesce(sum(v.monto), 0) from public.ventas v, d
       where v.tipo = 'venta' and v.fecha >= d.ma0 and v.fecha < d.ma0 + d.tramo),
    (select coalesce(sum(v.monto), 0) from public.ventas v, d
       where v.tipo = 'venta' and v.fecha >= d.aa0 and v.fecha < d.aa0 + d.tramo),
    (select count(distinct v.cliente_id) from public.ventas v, d
       where v.tipo = 'venta' and v.fecha >= d.m0  and v.fecha < d.m0  + d.tramo),
    (select count(distinct v.cliente_id) from public.ventas v, d
       where v.tipo = 'venta' and v.fecha >= d.ma0 and v.fecha < d.ma0 + d.tramo),
    (select count(distinct v.cliente_id) from public.ventas v, d
       where v.tipo = 'venta' and v.fecha >= d.aa0 and v.fecha < d.aa0 + d.tramo)
  from d;
$$;

-- Facturación y CCC YTD por equipo (supervisores).
create or replace function public.distro_supervisores_ytd(anio int default null)
returns table (equipo_id uuid, equipo text, facturacion numeric, ccc bigint, ccc_objetivo int)
language sql stable security invoker as $$
  with b as (select coalesce(anio, extract(year from current_date)::int) as y)
  select e.id, e.nombre,
    coalesce(sum(v.monto) filter (where v.tipo = 'venta'), 0),
    count(distinct v.cliente_id) filter (where v.tipo = 'venta'),
    coalesce(max(mt.ccc_objetivo), 0)
  from public.equipos e
  cross join b
  left join public.vendedores ve on ve.equipo_id = e.id
  left join public.ventas v on v.vendedor_id = ve.id
    and v.fecha >= make_date(b.y, 1, 1) and v.fecha < make_date(b.y + 1, 1, 1)
  left join public.metas mt on mt.equipo_id = e.id and mt.periodo = to_char(current_date, 'YYYY-MM')
  group by e.id, e.nombre
  order by 3 desc;
$$;
-- ===========================================================================
-- Distro — Funciones de mantenimiento (service role / Edge Functions).
-- No son invocables por usuarios finales: las llama el proceso de recálculo.
-- ===========================================================================

-- Reconstruye resumen_diario a partir de ventas. Agregado por (fecha, vendedor,
-- rubro). Idempotente: hace upsert y limpia combinaciones que ya no existen.
create or replace function public.distro_refresh_resumen_diario()
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.resumen_diario (fecha, vendedor_id, rubro_id, monto, visitas)
  select
    v.fecha,
    v.vendedor_id,
    v.rubro_id,
    sum(v.monto) filter (where v.tipo = 'venta') as monto,
    count(*) filter (where v.tipo = 'venta') as visitas
  from public.ventas v
  group by v.fecha, v.vendedor_id, v.rubro_id
  on conflict (fecha, vendedor_id, rubro_id)
  do update set monto = excluded.monto, visitas = excluded.visitas;

  -- Eliminar filas de resumen que ya no tienen respaldo en ventas.
  delete from public.resumen_diario rd
  where not exists (
    select 1 from public.ventas v
    where v.fecha = rd.fecha
      and v.vendedor_id is not distinct from rd.vendedor_id
      and v.rubro_id is not distinct from rd.rubro_id
  );
end $$;

-- Revocar a roles públicos; solo service role (que bypassa) la ejecuta.
revoke all on function public.distro_refresh_resumen_diario() from public, anon, authenticated;
-- ===========================================================================
-- Distro — Seed de demo para una Supabase de tenant.
-- Crea catálogos mínimos para poder navegar el producto sin carga real.
-- Ejecutar DESPUÉS de schema.sql + rls.sql + rpc.sql.
-- ===========================================================================

insert into public.equipos (id, nombre) values
  ('11111111-1111-1111-1111-111111111111', 'Equipo Norte'),
  ('22222222-2222-2222-2222-222222222222', 'Equipo Sur')
on conflict do nothing;

insert into public.rubros (nombre) values
  ('Bebidas'), ('Almacén'), ('Limpieza'), ('Premium')
on conflict do nothing;

insert into public.vendedores (id, nombre, equipo_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana Gómez', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Luis Pérez', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

-- Metas de CCC del período actual
insert into public.metas (equipo_id, periodo, ccc_objetivo, facturacion_objetivo)
values
  ('11111111-1111-1111-1111-111111111111', to_char(current_date, 'YYYY-MM'), 120, 5000000),
  ('22222222-2222-2222-2222-222222222222', to_char(current_date, 'YYYY-MM'), 90, 3500000)
on conflict (equipo_id, periodo) do nothing;

-- NOTA: para que un usuario pueda loguearse, crear el usuario en Auth
-- (auth.users) y luego insertar su fila en app_users con el auth_user_id real:
--
-- insert into public.app_users (auth_user_id, nombre, email, rol, equipo_id)
-- values ('<uuid-de-auth.users>', 'Admin Demo', 'admin@demo.com', 'admin', null);
