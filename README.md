<div align="center">

# Distro

**Plataforma SaaS de gestión comercial e inteligencia de ventas para equipos en campo.**

Multi-tenant con _una Supabase aislada por cliente_ — datos, auth y RLS independientes por empresa.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Anthropic](https://img.shields.io/badge/AI-Claude-D97757?logo=anthropic&logoColor=white)](https://www.anthropic.com/)

</div>

---

## ¿Qué es Distro?

Distro centraliza la información de ventas de empresas con fuerza comercial en campo
(distribuidoras, consumo masivo) y la convierte en decisiones: salud de cada punto de
venta, metas por vendedor, rutas optimizadas y recomendaciones generadas por IA. Cada
cliente vive en su propia base de datos Supabase, así que **los datos nunca se mezclan**.

## Características

- **📊 Dashboard analítico** — KPIs, estacionalidad y comparativos por período, zona y vendedor.
- **🧠 Inteligencia comercial** — score de salud de PDV, segmentación RFM, riesgo de abandono y predicción de próxima compra.
- **🗺️ Rutas** — mapa de puntos de venta con densificación y Google Maps.
- **🎯 Metas** — edición y seguimiento de meta CCC (roles supervisor/admin).
- **💬 Chat IA** — preguntas en lenguaje natural respondidas vía tool-use sobre RPC predefinidas (el modelo nunca genera SQL).
- **⚙️ Onboarding sin código** — carga de Excel, mapeo de columnas guardado y reaplicable, limpieza y deduplicación automáticas.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend / SSR | Next.js 14 (App Router), React 18, TypeScript |
| Estilos | Tailwind CSS, Recharts |
| Datos / Auth | Supabase (Postgres + RLS), `@supabase/ssr` |
| IA | Anthropic API (`@anthropic-ai/sdk`), tool-use |
| Datos de entrada | `xlsx`, validación con `zod`, fechas con `date-fns` |

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
    intelligence/             Scoring, RFM, riesgo, Centro de Recomendaciones IA
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

> Requiere Node.js 20+ y una cuenta de Supabase.

1. `npm install`
2. Crear la Supabase **maestra** y aplicar `supabase/master/schema.sql`.
3. Por cada tenant: crear su Supabase y aplicar, en orden,
   `supabase/tenant/{schema,rls,rpc,maintenance,seed}.sql`. Deploy de
   `supabase/functions/recalcular-metricas`. (Ver `supabase/README.md`.)
4. Registrar el tenant en la tabla `tenants` (maestra).
5. Copiar `.env.example` a `.env.local` y completar credenciales.
6. `npm run dev` y abrir `http://localhost:3000/<tenant-slug>`.

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
- Las credenciales por tenant viven en la maestra, nunca en el bundle del cliente.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servir el build |
| `npm run lint` | ESLint (next lint) |
| `npm run typecheck` | Chequeo de tipos (`tsc --noEmit`) |

### Tests del dominio

- `node --experimental-strip-types scripts/check-clean.ts` — tests del pipeline.
- `node --experimental-strip-types scripts/check-score.ts` — tests del scoring.
</content>
</invoke>
