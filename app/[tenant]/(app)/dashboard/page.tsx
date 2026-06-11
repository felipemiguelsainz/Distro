import { tenantServerClient } from "@/lib/supabase/tenant-server";
import { getDashboardView } from "@/lib/analytics/dashboard-view";
import { DashboardKpis } from "@/components/analytics/dashboard-kpis";
import { DashboardCharts } from "@/components/analytics/dashboard-charts";
import { MonthTracker } from "@/components/analytics/month-tracker";

export const dynamic = "force-dynamic";

/** Estado global del mes según la performance de facturación vs avance esperado. */
function estadoGlobal(performance: number): { cls: string; text: string } {
  if (performance >= 100) return { cls: "adelantado", text: "Adelantado" };
  if (performance >= 85) return { cls: "enlinea", text: "En línea" };
  return { cls: "atrasado", text: "Atrasado" };
}

/**
 * Dashboard. Usa datos REALES del tenant (getDashboardView); si todavía no se
 * cargaron ventas, cae automáticamente a datos demo realistas. Apenas se sube
 * el primer Excel, pasa a datos reales sin tocar nada.
 */
export default async function DashboardPage({
  params,
}: {
  params: { tenant: string };
}) {
  const { client } = await tenantServerClient(params.tenant);
  const view = await getDashboardView(client);
  const { tendencia } = view;
  const estado = estadoGlobal(tendencia.performanceFacturacion);
  const pctMes = Math.round(tendencia.pctMes * 100);

  return (
    <div className="space-y-6">
      <div className="dp-page-head">
        <div className="dp-head-left">
          <h1 className="section-title">Dashboard</h1>
          <span className="dp-days-pill">
            <i className="ti ti-calendar" />
            {tendencia.diasTranscurridos} de {tendencia.diasTotales} días hábiles · {pctMes}% del mes
          </span>
          {!view.hasData && (
            <span className="tag-pill" style={{ color: "var(--accent-dark)" }}>
              Datos de muestra · subí un Excel
            </span>
          )}
        </div>
        <span className={`dp-status-badge ${estado.cls}`}>
          <i className="ti ti-flag" />
          {estado.text}
        </span>
      </div>

      <MonthTracker tendencia={tendencia} />

      <section className="space-y-3">
        <span className="section-label">Indicadores clave</span>
        <DashboardKpis
          kpis={view.kpis}
          supervisores={view.supervisores}
          tendencia={tendencia}
        />
      </section>

      <section className="space-y-3">
        <span className="section-label">Tus números, listos para leer</span>
        <DashboardCharts
          facturacion={view.facturacion}
          ccc={view.ccc}
          mix={view.mix}
          yearLabels={view.yearLabels}
          badgeFacturacion={view.badgeFacturacion}
        />
      </section>
    </div>
  );
}
