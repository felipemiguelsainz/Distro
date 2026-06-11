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
