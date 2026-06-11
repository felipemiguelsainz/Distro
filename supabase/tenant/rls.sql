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
