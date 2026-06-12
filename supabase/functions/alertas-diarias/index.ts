// Edge Function: alertas-diarias
// Corre todos los días (cron) sobre la Supabase MAESTRA. Para cada tenant activo
// detecta alertas comerciales, las persiste en su tabla `alertas` y manda un
// email-resumen a supervisores y admins vía Resend.
//
// Deploy (en el proyecto MAESTRO): supabase functions deploy alertas-diarias
// Env requeridas: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (maestra, inyectadas),
//                 RESEND_API_KEY, ALERTAS_FROM_EMAIL, ALERTAS_FROM_NAME, APP_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Resend } from "npm:resend@4";

import {
  detectarVendedoresCaidos,
  detectarClientesSinCompra,
  detectarCccBajo,
  detectarFacturacionCaida,
  diasHabilesTranscurridos,
  diasHabilesTotales,
  performanceVsMeta,
  renderEmailAlertas,
  type AlertaDetectada,
  type ClienteRiesgo,
  type SupRow,
  type Tendencia,
} from "../_shared/alertas.ts";

const fmtMoneda = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n).toLocaleString("es-AR")}`;
const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const r1 = (n: number) => Math.round(n * 10) / 10;

interface TenantRow {
  slug: string;
  nombre: string;
  supabase_url: string;
  supabase_service_role_key: string | null;
}

type TenantClient = ReturnType<typeof createClient>;

/** Reúne los datos mínimos (supervisores + tendencia) que consumen los detectores. */
async function gatherDashboard(
  client: TenantClient,
  hoy: Date,
): Promise<{ supervisores: SupRow[]; tendencia: Tendencia }> {
  const year = hoy.getFullYear();
  const periodo = `${year}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

  // Supervisores (avance vs meta CCC ajustado por días hábiles).
  const { data: supData, error: supErr } = await client.rpc("distro_supervisores_ytd");
  if (supErr) throw new Error(`supervisores_ytd: ${supErr.message}`);
  const supervisores: SupRow[] = ((supData ?? []) as Record<string, unknown>[]).map((s) => {
    const obj = Number(s.ccc_objetivo);
    const c = Number(s.ccc);
    return {
      nombre: String(s.equipo),
      ytd: fmtMoneda(Number(s.facturacion)),
      ccc: fmtInt(c),
      pct: obj > 0 ? Math.min(100, Math.round((c / obj) * 100)) : 0,
      tendPct: obj > 0 ? performanceVsMeta(c, obj, hoy) : 100,
    };
  });

  // Meta de CCC del mes (suma de equipos).
  const { data: metasData } = await client
    .from("metas")
    .select("ccc_objetivo")
    .eq("periodo", periodo);
  const metaCccMes = ((metasData ?? []) as { ccc_objetivo: number | null }[]).reduce(
    (acc, m) => acc + Number(m.ccc_objetivo ?? 0),
    0,
  );

  // Tendencia interanual + CCC actual (RPC distro_kpis_tendencia, con fallback).
  let cccActual = 0;
  let deltaFactAnioAnt: number | null = null;
  let deltaFactMesAnt: number | null = null;
  const { data: tendData, error: tendErr } = await client.rpc("distro_kpis_tendencia", {
    p_dias_transcurridos: hoy.getDate(),
  });
  if (!tendErr && tendData) {
    const t = ((tendData as Record<string, number>[]) ?? [])[0] ?? {};
    const fa = Number(t.facturacion_actual);
    const fm = Number(t.facturacion_mes_ant);
    const faa = Number(t.facturacion_anio_ant);
    cccActual = Number(t.ccc_actual);
    deltaFactAnioAnt = faa > 0 ? r1(((fa - faa) / faa) * 100) : null;
    deltaFactMesAnt = fm > 0 ? r1(((fa - fm) / fm) * 100) : null;
  } else {
    // Fallback: CCC del mes desde los KPIs base.
    const { data: kpiData } = await client.rpc("distro_dashboard_kpis");
    cccActual = Number(((kpiData as Record<string, number>[]) ?? [])[0]?.ccc_mes ?? 0);
  }

  const tendencia: Tendencia = {
    diasTranscurridos: diasHabilesTranscurridos(hoy),
    diasTotales: diasHabilesTotales(hoy),
    performanceCcc: metaCccMes > 0 ? performanceVsMeta(cccActual, metaCccMes, hoy) : 100,
    deltaFactAnioAnt,
    deltaFactMesAnt,
  };
  return { supervisores, tendencia };
}

/** Clientes en riesgo/dormido (subset del lib/intelligence/queries). */
async function gatherClientesRiesgo(client: TenantClient): Promise<ClienteRiesgo[]> {
  const { data: metricas, error } = await client
    .from("cliente_metricas")
    .select("cliente_id, segmento, dias_sin_compra")
    .in("segmento", ["riesgo", "dormido"])
    .limit(200);
  if (error) throw new Error(`riesgo: ${error.message}`);

  const ids = ((metricas ?? []) as { cliente_id: string }[]).map((m) => m.cliente_id);
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const { data: clientes } = await client
      .from("clientes")
      .select("id, nombre_normalizado")
      .in("id", ids);
    for (const c of (clientes ?? []) as { id: string; nombre_normalizado: string }[]) {
      nombres.set(c.id, c.nombre_normalizado);
    }
  }
  return ((metricas ?? []) as Record<string, unknown>[]).map((m) => ({
    clienteId: String(m.cliente_id),
    nombre: nombres.get(String(m.cliente_id)) ?? "—",
    segmento: (m.segmento ?? null) as ClienteRiesgo["segmento"],
    diasSinCompra: m.dias_sin_compra == null ? null : Number(m.dias_sin_compra),
  }));
}

async function destinatarios(client: TenantClient): Promise<string[]> {
  const { data } = await client
    .from("app_users")
    .select("email")
    .in("rol", ["admin", "super_admin", "supervisor"])
    .eq("activo", true);
  const set = new Set<string>();
  for (const u of (data ?? []) as { email: string | null }[]) {
    if (u.email) set.add(u.email);
  }
  return [...set];
}

async function procesarTenant(
  t: TenantRow,
  resend: Resend,
  from: string,
  urlApp: string,
  hoy: Date,
  fecha: string,
): Promise<{ slug: string; status: string; alertas: number }> {
  if (!t.supabase_service_role_key) {
    return { slug: t.slug, status: "sin service role", alertas: 0 };
  }
  const client = createClient(t.supabase_url, t.supabase_service_role_key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Reunir datos y detectar.
  const [{ supervisores, tendencia }, clientes] = await Promise.all([
    gatherDashboard(client, hoy),
    gatherClientesRiesgo(client),
  ]);
  const alertas: AlertaDetectada[] = [
    ...detectarVendedoresCaidos(supervisores),
    ...detectarClientesSinCompra(clientes),
    ...detectarCccBajo(tendencia),
    ...detectarFacturacionCaida(tendencia),
  ];

  // 2. Persistir las alertas detectadas (marcadas como enviadas).
  if (alertas.length > 0) {
    const { error } = await client.from("alertas").insert(
      alertas.map((a) => ({
        tipo: a.tipo,
        titulo: a.titulo,
        detalle: a.detalle,
        severidad: a.severidad,
        metadata: a.metadata,
        enviada: true,
      })),
    );
    if (error) throw new Error(`insert alertas: ${error.message}`);
  }

  // 3. Enviar el email-resumen.
  const to = await destinatarios(client);
  if (to.length === 0) {
    return { slug: t.slug, status: "sin destinatarios", alertas: alertas.length };
  }
  const subject =
    alertas.length > 0
      ? `[Distro] ${alertas.length} alerta${alertas.length === 1 ? "" : "s"} detectada${alertas.length === 1 ? "" : "s"} — ${fecha}`
      : `[Distro] Todo en orden — ${fecha}`;
  const html = renderEmailAlertas({
    tenantNombre: t.nombre,
    fecha,
    alertas,
    urlApp,
    tenantSlug: t.slug,
  });
  await resend.emails.send({ from, to, subject, html });

  return {
    slug: t.slug,
    status: alertas.length > 0 ? "ok" : "sin alertas",
    alertas: alertas.length,
  };
}

Deno.serve(async () => {
  try {
    const master = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
    const from = `${Deno.env.get("ALERTAS_FROM_NAME") ?? "Distro"} <${Deno.env.get("ALERTAS_FROM_EMAIL") ?? "alertas@distro.app"}>`;
    const urlApp = Deno.env.get("APP_URL") ?? Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://distro.app";

    const hoy = new Date();
    const fecha = new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(hoy);

    const { data: tenants, error } = await master
      .from("tenants")
      .select("slug, nombre, supabase_url, supabase_service_role_key")
      .eq("activo", true);
    if (error) throw new Error(`tenants: ${error.message}`);

    const resultados: { slug: string; status: string; alertas: number }[] = [];
    for (const t of (tenants ?? []) as TenantRow[]) {
      try {
        resultados.push(await procesarTenant(t, resend, from, urlApp, hoy, fecha));
      } catch (e) {
        // Un tenant que falla no corta el loop.
        console.error(`[alertas-diarias] ${t.slug} falló:`, e);
        resultados.push({ slug: t.slug, status: `error: ${String(e)}`, alertas: 0 });
      }
    }

    return Response.json({ ok: true, fecha, tenants: resultados.length, resultados });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
