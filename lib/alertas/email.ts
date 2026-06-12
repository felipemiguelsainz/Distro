/**
 * Template de email de alertas — HTML con estilos inline (sin dependencias de
 * templating) para máxima compatibilidad con clientes de correo. Mantiene la
 * paleta de la app: acento naranja, fondo claro, tipografía Inter.
 *
 * La Edge Function `alertas-diarias` corre en Deno y no puede importar este
 * módulo: mantiene una copia en sync en `supabase/functions/_shared/alertas.ts`.
 */

import type { AlertaDetectada } from "./detectar";

const COLORS = {
  accent: "#ba7517",
  accentDark: "#854f0b",
  bg: "#f5f4f0",
  card: "#ffffff",
  border: "#e7e5e0",
  text: "#1a1a18",
  textSec: "#6b6a65",
  ok: "#2f9e6a",
};

// Borde izquierdo de cada card según severidad (rojo alta, naranja media, azul baja).
const SEV_COLOR: Record<AlertaDetectada["severidad"], string> = {
  alta: "#d85a30",
  media: "#ba7517",
  baja: "#378add",
};

const SEV_LABEL: Record<AlertaDetectada["severidad"], string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardAlerta(a: AlertaDetectada): string {
  const color = SEV_COLOR[a.severidad];
  return `
  <tr>
    <td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.card};border:0.5px solid ${COLORS.border};border-left:4px solid ${color};border-radius:8px;">
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${color};margin-bottom:4px;">${SEV_LABEL[a.severidad]}</div>
            <div style="font-size:15px;font-weight:600;color:${COLORS.text};margin-bottom:4px;">${esc(a.titulo)}</div>
            <div style="font-size:13px;line-height:1.5;color:${COLORS.textSec};">${esc(a.detalle)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function bloqueSinAlertas(): string {
  return `
  <tr>
    <td style="padding:8px 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.card};border:0.5px solid ${COLORS.border};border-radius:8px;">
        <tr>
          <td style="padding:28px 16px;text-align:center;">
            <div style="font-size:30px;line-height:1;color:${COLORS.ok};margin-bottom:8px;">&#10003;</div>
            <div style="font-size:15px;font-weight:600;color:${COLORS.text};">Todo en orden hoy.</div>
            <div style="font-size:13px;color:${COLORS.textSec};margin-top:2px;">Sin alertas pendientes.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function renderEmailAlertas(params: {
  tenantNombre: string;
  /** Fecha legible, p.ej. "jueves 12 de junio". */
  fecha: string;
  alertas: AlertaDetectada[];
  /** Base de la app para el CTA "Ver en Distro" (sin slash final). */
  urlApp: string;
  /** Slug del tenant para armar el link al dashboard. */
  tenantSlug: string;
}): string {
  const { tenantNombre, fecha, alertas, urlApp, tenantSlug } = params;
  const dashboardUrl = `${urlApp.replace(/\/$/, "")}/${tenantSlug}/dashboard`;

  const cuerpo =
    alertas.length > 0 ? alertas.map(cardAlerta).join("") : bloqueSinAlertas();

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Resumen de alertas — ${esc(fecha)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 20px 0;">
              <div style="font-size:20px;font-weight:700;color:${COLORS.accent};letter-spacing:-0.01em;">Distro</div>
              <div style="font-size:13px;color:${COLORS.textSec};margin-top:2px;">${esc(tenantNombre)}</div>
            </td>
          </tr>

          <!-- Título -->
          <tr>
            <td style="padding:0 0 16px 0;">
              <div style="font-size:18px;font-weight:600;color:${COLORS.text};">Resumen de alertas — ${esc(fecha)}</div>
            </td>
          </tr>

          <!-- Alertas -->
          ${cuerpo}

          <!-- CTA -->
          <tr>
            <td style="padding:12px 0 24px 0;">
              <a href="${esc(dashboardUrl)}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">Ver en Distro</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:0.5px solid ${COLORS.border};padding:16px 0 0 0;">
              <div style="font-size:11px;line-height:1.6;color:${COLORS.textSec};">
                Este email fue generado automáticamente por Distro. Para dejar de recibirlo, contactá al administrador.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
