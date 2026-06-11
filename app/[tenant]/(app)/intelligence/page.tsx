import { tenantServerClient } from "@/lib/supabase/tenant-server";
import { getSession } from "@/lib/auth/session";
import {
  getClientesEnRiesgo,
  getComprasVencidas,
  getRecomendaciones,
  getSegmentosResumen,
} from "@/lib/intelligence/queries";
import { RecomendacionesPanel } from "@/components/intelligence/recomendaciones-panel";
import { SegmentoBadge } from "@/components/shared/segmento-badge";
import { formatMoneda } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IntelligencePage({
  params,
}: {
  params: { tenant: string };
}) {
  const { client } = await tenantServerClient(params.tenant);
  const session = await getSession(params.tenant);
  const puedeRegenerar =
    session?.appUser.rol === "admin" || session?.appUser.rol === "super_admin";

  const [riesgo, segmentos, vencidas, recomendaciones] = await Promise.all([
    getClientesEnRiesgo(client),
    getSegmentosResumen(client),
    getComprasVencidas(client),
    getRecomendaciones(client),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="section-title">Intelligence</h1>

      <RecomendacionesPanel
        slug={params.tenant}
        recomendaciones={recomendaciones}
        puedeRegenerar={!!puedeRegenerar}
      />

      {/* Segmentación + próxima compra */}
      <section className="space-y-3">
        <span className="section-label">Segmentación y oportunidad</span>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card lg:col-span-2">
            <h2 className="mb-3 text-sm font-medium text-gray-700">
              Segmentación automática (RFM)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {segmentos.map((s) => (
                <div key={s.segmento} className="card card-hover">
                  <SegmentoBadge segmento={s.segmento} />
                  <p className="kpi-value mt-2">{s.clientes}</p>
                  <p className="kpi-label mt-1">{formatMoneda(s.montoPromedio)} prom.</p>
                </div>
              ))}
              {segmentos.length === 0 && (
                <p className="text-sm text-gray-400">Sin datos de segmentación aún.</p>
              )}
            </div>
          </div>
          <div className="card flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <p className="kpi-label">Próxima compra</p>
              {vencidas > 0 && (
                <span className="dp-tend atrasado">
                  <i className="ti ti-alert-triangle" />
                  Vencidos
                </span>
              )}
            </div>
            <p className="kpi-value mt-2" style={{ color: "var(--accent-dark)" }}>
              {vencidas}
            </p>
            <p className="kpi-label mt-1">
              clientes superaron el plazo esperado de compra
            </p>
          </div>
        </div>
      </section>

      {/* Clientes en riesgo */}
      <section className="space-y-3">
        <span className="section-label">Clientes en riesgo ({riesgo.length})</span>
        <div className="dp-table-wrap">
          <div className="dp-table-head">
            <span>Cliente</span>
            <span>Segmento</span>
            <span>Score</span>
            <span>Motivo</span>
          </div>
          {riesgo.map((c) => (
            <div className="dp-sup-row" key={c.clienteId}>
              <span className="dp-sup-name">
                {c.nombre}
                <span className="block text-xs font-normal text-gray-400">{c.zona ?? "—"}</span>
              </span>
              <span>
                <SegmentoBadge segmento={c.segmento} />
              </span>
              <span className="dp-sup-num">{c.scoreSalud ?? "—"}</span>
              <span className="dp-sup-num">{c.motivo}</span>
            </div>
          ))}
          {riesgo.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No hay clientes en riesgo. 🎉
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
