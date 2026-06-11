# Supabase de Distro

Distro es **multi-tenant con una Supabase por cliente**. Hay dos tipos de proyecto:

```
Supabase MAESTRA (control plane)   → supabase/master/
  └── tenants { id, slug, nombre, supabase_url, supabase_anon_key,
                supabase_service_role_key, modulos_activos[] }

Supabase CLIENTE (una por tenant)  → supabase/tenant/
  └── schema estándar de Distro (idéntico en todos), datos aislados
```

## 1. Maestra

En el proyecto Supabase maestro, ejecutar:

```bash
supabase/master/schema.sql
```

Cargar las credenciales en `.env`:

```
NEXT_PUBLIC_MASTER_SUPABASE_URL=...
NEXT_PUBLIC_MASTER_SUPABASE_ANON_KEY=...
MASTER_SUPABASE_SERVICE_ROLE_KEY=...   # server-only
```

Registrar un tenant (con service role, nunca desde el browser):

```sql
insert into public.tenants (slug, nombre, supabase_url, supabase_anon_key,
                            supabase_service_role_key, modulos_activos)
values ('demo', 'Empresa Demo', 'https://xxxx.supabase.co', 'anon-key',
        'service-role-key',
        array['analytics','intelligence','rutas','metas','chat']);
```

## 2. Cliente (por cada tenant)

En la Supabase del cliente, ejecutar **en orden**:

```bash
supabase/tenant/schema.sql   # tablas, tipos, índices
supabase/tenant/rls.sql      # helpers + políticas por rol
supabase/tenant/rpc.sql      # funciones que puede invocar el chat IA
supabase/tenant/seed.sql     # (opcional) datos de demo
supabase/functions/          # Edge Functions de scoring (deploy aparte)
```

Crear el primer usuario en **Authentication** y vincularlo en `app_users`
(ver nota al pie de `seed.sql`).

## Notas de seguridad

- La tabla `tenants` de la maestra tiene RLS `deny all`: solo el service role
  (server-side) la lee. El browser nunca conoce más de un tenant a la vez.
- Las RPC de `rpc.sql` son `SECURITY INVOKER`: respetan la RLS del rol que
  consulta. El chat IA solo puede llamar a estas funciones, nunca SQL libre.
- Las Edge Functions de scoring usan el service role del tenant para recalcular
  `cliente_metricas` y `resumen_diario` sin bloquear la UI.
