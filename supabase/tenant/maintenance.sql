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
