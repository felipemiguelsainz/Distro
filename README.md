# Distro

Plataforma SaaS de gestión comercial e inteligencia de ventas para empresas con
equipos en campo. **Multi-tenant con una Supabase por cliente**.

Stack: Next.js 14 (App Router) · TypeScript · Supabase · Tailwind · Anthropic API.

## Arquitectura

```
Supabase MAESTRA (control plane)        → supabase/master/
  └── tenants { slug, supabase_url, supabase_anon_key,
                supabase_service_role_key, modulos_activos[] }

Supabase CLIENTE (una por tenant)       → supabase/tenant/
  └── schema estándar de Distro (idéntico), datos aislados + RLS por rol
```

No hay cliente Supabase global. En cada request se resuelve el tenant por el
segmento de ruta `/[tenant]/...`, se leen sus credenciales de la maestra
(server-side, service role) y se instancia un cliente dinámico:

| Cliente | Archivo | Uso |
|---|---|---|
| Maestra (service role) | `lib/supabase/master.ts` | Resolver tenant, leer credenciales |
| Tenant server (sesión usuario) | `lib/supabase/tenant-server.ts` → `tenantServerClient` | Server Components / Actions con RLS |
| Tenant admin (service role) | `tenantAdminClient` | Pipeline, recálculo de métricas |
| Tenant browser | `lib/supabase/tenant-browser.ts` + `TenantProvider` | Auth y queries del lado cliente |

## Estructura

```
app/[tenant]/
  login/                      Login contra la Supabase del tenant
  (app)/                      Shell autenticado (sidebar + gate de sesión)
    dashboard/                Analytics: KPIs, estacionalidad, comparativos
    intelligence/            Scoring, RFM, riesgo, Centro de Recomendaciones IA
    rutas/                    Mapa de PDVs + densificación + Google Maps
    metas/                    Edición de meta CCC (supervisor/admin)
    chat/                     Chat IA (tool-use → RPC predefinidas)
    admin/onboarding/         Configuración sin código + carga/mapeo
lib/
  supabase/                   Cliente dinámico por tenant + tipos
  pipeline/                   Parseo, limpieza, mapeo, dedup, normalización
  scoring/                    Score de salud, RFM, próxima compra (puro + recalc)
  analytics/  intelligence/   Queries de cada módulo
  ai/                         Anthropic: chat (tools) + recomendaciones
supabase/
  master/  tenant/            SQL (schema, RLS, RPC, mantenimiento, seed)
  functions/recalcular-metricas/   Edge Function de scoring incremental
```

## Setup

1. `npm install`
2. Crear la Supabase maestra y aplicar `supabase/master/schema.sql`.
3. Por cada tenant: crear su Supabase y aplicar, en orden,
   `supabase/tenant/{schema,rls,rpc,maintenance,seed}.sql`. Deploy de
   `supabase/functions/recalcular-metricas`. (Ver `supabase/README.md`.)
4. Registrar el tenant en `tenants` (maestra).
5. Copiar `.env.example` a `.env.local` y completar credenciales.
6. `npm run dev`

## Pipeline de carga

`Excel → staging → ventas` (idempotente, incremental). Limpieza de fechas
(múltiples formatos), montos (LATAM/US/contable), detección de devoluciones,
dedup de clientes por código o nombre+zona. El mapeo de columnas se guarda y se
reaplica. El recálculo de métricas corre solo sobre los clientes afectados.

## Decisiones de seguridad

- La tabla `tenants` (maestra) tiene RLS `deny all`: solo el service role la lee.
- Las RPC del chat son `SECURITY INVOKER`: respetan la RLS del rol que pregunta.
- El chat IA **nunca** genera SQL: el modelo solo puede invocar RPC predefinidas
  vía tool-use (`lib/ai/chat-tools.ts`).

## Verificación

- `npm run typecheck` — tipos del proyecto.
- `npm run build` — build de producción.
- `node --experimental-strip-types scripts/check-clean.ts` — tests del pipeline.
- `node --experimental-strip-types scripts/check-score.ts` — tests del scoring.
```
