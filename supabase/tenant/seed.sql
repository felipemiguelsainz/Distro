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
