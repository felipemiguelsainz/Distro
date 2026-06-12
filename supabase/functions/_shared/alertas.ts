// Copia Deno-friendly de la detección de alertas + template de email.
// Mantener en sync con lib/alertas/detectar.ts y lib/alertas/email.ts.
// Sin imports de Node ni alias "@/".

export type Severidad = "alta" | "media" | "baja";

export interface AlertaDetectada {
  tipo: "vendedor_caida" | "cliente_sin_compra" | "ccc_bajo" | "facturacion_caida";
  titulo: string;
  detalle: string;
  severidad: Severidad;
  metadata: Record<string, unknown>;
}

// Shapes mínimos que necesitan los detectores (subset de los view-models).
export interface SupRow {
  nombre: string;
  ytd: string;
  ccc: string;
  pct: number;
  tendPct: number;
}
export interface Tendencia {
  diasTranscurridos: number;
  diasTotales: number;
  performanceCcc: number;
  deltaFactAnioAnt: number | null;
  deltaFactMesAnt: number | null;
}
export interface ClienteRiesgo {
  clienteId: string;
  nombre: string;
  segmento: "estrella" | "crecimiento" | "estable" | "riesgo" | "dormido" | null;
  diasSinCompra: number | null;
}

// ---------------------------------------------------------------------------
// Días hábiles (copia de lib/analytics/dias-habiles.ts, lo justo para alertas).
// ---------------------------------------------------------------------------
function esHabil(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}
function diasHabilesEntre(desde: Date, hasta: Date): number {
  const cur = new Date(desde);
  cur.setHours(12, 0, 0, 0);
  const fin = new Date(hasta);
  fin.setHours(12, 0, 0, 0);
  if (cur > fin) return 0;
  let count = 0;
  while (cur <= fin) {
    if (esHabil(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
export function diasHabilesTranscurridos(hoy: Date): number {
  return diasHabilesEntre(new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy);
}
export function diasHabilesTotales(hoy: Date): number {
  return diasHabilesEntre(
    new Date(hoy.getFullYear(), hoy.getMonth(), 1),
    new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0),
  );
}
/** Performance vs avance esperado, en % (100 = en línea con la meta). */
export function performanceVsMeta(acumulado: number, meta: number, hoy: Date): number {
  const total = diasHabilesTotales(hoy);
  const esperado = total === 0 ? 0 : meta * (diasHabilesTranscurridos(hoy) / total);
  if (esperado <= 0) return 0;
  return Math.round((acumulado / esperado) * 100);
}

// ---------------------------------------------------------------------------
// Detectores (mirror de lib/alertas/detectar.ts).
// ---------------------------------------------------------------------------
export function detectarVendedoresCaidos(
  supervisores: SupRow[],
  umbralPct = 75,
): AlertaDetectada[] {
  return supervisores
    .filter((s) => s.tendPct < umbralPct)
    .map((s) => ({
      tipo: "vendedor_caida" as const,
      titulo: `${s.nombre} por debajo de meta`,
      detalle:
        `Avance ajustado por días hábiles al ${s.tendPct}% de lo esperado ` +
        `(CCC ${s.ccc}, facturación ${s.ytd}).`,
      severidad: (s.tendPct < 60 ? "alta" : "media") as Severidad,
      metadata: { nombre: s.nombre, tendPct: s.tendPct, pct: s.pct, ccc: s.ccc, ytd: s.ytd },
    }));
}

export function detectarClientesSinCompra(
  clientes: ClienteRiesgo[],
  diasExtra = 7,
): AlertaDetectada[] {
  const sinCompra = clientes.filter(
    (c) => c.segmento === "dormido" || (c.diasSinCompra ?? 0) >= diasExtra,
  );
  if (sinCompra.length === 0) return [];

  const top = [...sinCompra]
    .sort((a, b) => (b.diasSinCompra ?? 0) - (a.diasSinCompra ?? 0))
    .slice(0, 3);
  const hayDormidos = sinCompra.some((c) => c.segmento === "dormido");

  return [
    {
      tipo: "cliente_sin_compra",
      titulo: `${sinCompra.length} cliente${sinCompra.length === 1 ? "" : "s"} sin compra reciente`,
      detalle:
        `Superaron su frecuencia habitual de compra. ` +
        `Ej.: ${top.map((c) => `${c.nombre} (${c.diasSinCompra ?? "—"} días)`).join(", ")}.`,
      severidad: hayDormidos || sinCompra.length >= 10 ? "alta" : "media",
      metadata: { total: sinCompra.length, clienteIds: sinCompra.map((c) => c.clienteId) },
    },
  ];
}

export function detectarCccBajo(tendencia: Tendencia, umbralPct = 80): AlertaDetectada[] {
  if (tendencia.performanceCcc >= umbralPct) return [];
  return [
    {
      tipo: "ccc_bajo",
      titulo: "CCC del mes por debajo del ritmo esperado",
      detalle:
        `El CCC va al ${tendencia.performanceCcc}% del avance esperado ` +
        `(día hábil ${tendencia.diasTranscurridos}/${tendencia.diasTotales}).`,
      severidad: tendencia.performanceCcc < 65 ? "alta" : "media",
      metadata: {
        performanceCcc: tendencia.performanceCcc,
        diasTranscurridos: tendencia.diasTranscurridos,
        diasTotales: tendencia.diasTotales,
      },
    },
  ];
}

export function detectarFacturacionCaida(
  tendencia: Tendencia,
  umbralPct = -10,
): AlertaDetectada[] {
  const delta = tendencia.deltaFactAnioAnt;
  if (delta == null || delta >= umbralPct) return [];
  return [
    {
      tipo: "facturacion_caida",
      titulo: "Facturación cayendo vs año anterior",
      detalle:
        `La facturación del mes va ${delta}% respecto al mismo período del ` +
        `año anterior.`,
      severidad: delta < -25 ? "alta" : "media",
      metadata: { deltaFactAnioAnt: delta, deltaFactMesAnt: tendencia.deltaFactMesAnt },
    },
  ];
}

// ---------------------------------------------------------------------------
// Template de email (mirror de lib/alertas/email.ts).
// ---------------------------------------------------------------------------
const C = {
  accent: "#ba7517",
  bg: "#f5f4f0",
  card: "#ffffff",
  border: "#e7e5e0",
  text: "#1a1a18",
  textSec: "#6b6a65",
  ok: "#2f9e6a",
};
const SEV_COLOR: Record<Severidad, string> = { alta: "#d85a30", media: "#ba7517", baja: "#378add" };
const SEV_LABEL: Record<Severidad, string> = { alta: "Alta", media: "Media", baja: "Baja" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cardAlerta(a: AlertaDetectada): string {
  const color = SEV_COLOR[a.severidad];
  return `
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:0.5px solid ${C.border};border-left:4px solid ${color};border-radius:8px;">
      <tr><td style="padding:14px 16px;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${color};margin-bottom:4px;">${SEV_LABEL[a.severidad]}</div>
        <div style="font-size:15px;font-weight:600;color:${C.text};margin-bottom:4px;">${esc(a.titulo)}</div>
        <div style="font-size:13px;line-height:1.5;color:${C.textSec};">${esc(a.detalle)}</div>
      </td></tr>
    </table>
  </td></tr>`;
}

function bloqueSinAlertas(): string {
  return `
  <tr><td style="padding:8px 0 12px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:0.5px solid ${C.border};border-radius:8px;">
      <tr><td style="padding:28px 16px;text-align:center;">
        <div style="font-size:30px;line-height:1;color:${C.ok};margin-bottom:8px;">&#10003;</div>
        <div style="font-size:15px;font-weight:600;color:${C.text};">Todo en orden hoy.</div>
        <div style="font-size:13px;color:${C.textSec};margin-top:2px;">Sin alertas pendientes.</div>
      </td></tr>
    </table>
  </td></tr>`;
}

export function renderEmailAlertas(params: {
  tenantNombre: string;
  fecha: string;
  alertas: AlertaDetectada[];
  urlApp: string;
  tenantSlug: string;
}): string {
  const { tenantNombre, fecha, alertas, urlApp, tenantSlug } = params;
  const dashboardUrl = `${urlApp.replace(/\/$/, "")}/${tenantSlug}/dashboard`;
  const cuerpo = alertas.length > 0 ? alertas.map(cardAlerta).join("") : bloqueSinAlertas();

  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Resumen de alertas — ${esc(fecha)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 0 20px 0;">
          <div style="font-size:20px;font-weight:700;color:${C.accent};letter-spacing:-0.01em;">Distro</div>
          <div style="font-size:13px;color:${C.textSec};margin-top:2px;">${esc(tenantNombre)}</div>
        </td></tr>
        <tr><td style="padding:0 0 16px 0;">
          <div style="font-size:18px;font-weight:600;color:${C.text};">Resumen de alertas — ${esc(fecha)}</div>
        </td></tr>
        ${cuerpo}
        <tr><td style="padding:12px 0 24px 0;">
          <a href="${esc(dashboardUrl)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">Ver en Distro</a>
        </td></tr>
        <tr><td style="border-top:0.5px solid ${C.border};padding:16px 0 0 0;">
          <div style="font-size:11px;line-height:1.6;color:${C.textSec};">
            Este email fue generado automáticamente por Distro. Para dejar de recibirlo, contactá al administrador.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
