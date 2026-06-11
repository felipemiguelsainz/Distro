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
