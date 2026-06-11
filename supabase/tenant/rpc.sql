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
