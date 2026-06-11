"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  CccPoint,
  FactPoint,
  MixItem,
} from "@/lib/analytics/dashboard-view";

const ACCENT = "#BA7517";
const ACCENT_DARK = "#854F0B";
const GRAY_MED = "#9a968c";
const GRAY_LIGHT = "#d4d0c6";
const AXIS = "#a8a499";

type TooltipRow = { name: string; value: number | string; color: string };
function DistroTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: string;
  rows?: TooltipRow[];
}) {
  if (!active || !rows) return null;
  return (
    <div className="recharts-tooltip-distro">
      <div className="rt-name">{label}</div>
      {rows.map((r) => (
        <div className="rt-row" key={r.name}>
          <span className="chart-legend-dot" style={{ background: r.color, width: 8, height: 8 }} />
          {r.name}: {r.value}
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((i) => (
        <span className="chart-legend-item" key={i.label}>
          <span className="chart-legend-dot" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

const axisProps = {
  tick: { fill: AXIS, fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;

export function DashboardCharts({
  facturacion,
  ccc,
  mix,
  yearLabels,
  badgeFacturacion,
}: {
  facturacion: FactPoint[];
  ccc: CccPoint[];
  mix: MixItem[];
  yearLabels: { y0: string; y1: string; y2: string };
  badgeFacturacion: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <div className="charts-grid" ref={ref}>
      {/* Facturación mensual comparativa */}
      <div className="chart-card wide">
        <div className="chart-head">
          <span className="chart-title">Facturación mensual comparativa</span>
          <span className="chart-badge">{badgeFacturacion}</span>
        </div>
        <p className="chart-sub">En millones de $, por año</p>
        <div style={{ height: 260 }}>
          {visible && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={facturacion} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#00000010" vertical={false} />
                <XAxis dataKey="mes" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v) => `$${v}m`} width={48} />
                <Tooltip
                  cursor={{ stroke: "#00000018" }}
                  content={({ active, label, payload }) => (
                    <DistroTooltip
                      active={active}
                      label={label as string}
                      rows={(payload ?? []).map((p) => ({
                        name: String(p.name),
                        value: `$${Number(p.value).toFixed(2)}M`,
                        color: p.color as string,
                      }))}
                    />
                  )}
                />
                <Line type="monotone" dataKey="y0" name={yearLabels.y0} stroke={GRAY_LIGHT} strokeWidth={2} dot={false} animationDuration={1200} />
                <Line type="monotone" dataKey="y1" name={yearLabels.y1} stroke={GRAY_MED} strokeWidth={2} dot={false} animationDuration={1300} />
                <Line type="monotone" dataKey="y2" name={yearLabels.y2} stroke={ACCENT} strokeWidth={2.5} dot={false} animationDuration={1500} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <Legend
          items={[
            { label: yearLabels.y2, color: ACCENT },
            { label: yearLabels.y1, color: GRAY_MED },
            { label: yearLabels.y0, color: GRAY_LIGHT },
          ]}
        />
      </div>

      {/* CCC mensual + efectividad */}
      <div className="chart-card">
        <div className="chart-head">
          <span className="chart-title">CCC mensual y efectividad</span>
        </div>
        <p className="chart-sub">Cartera activa vs clientes compradores</p>
        <div style={{ height: 240 }}>
          {visible && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={ccc} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#00000010" vertical={false} />
                <XAxis dataKey="mes" {...axisProps} interval={1} />
                <YAxis {...axisProps} width={44} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} {...axisProps} width={34} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  cursor={{ fill: "#00000008" }}
                  content={({ active, label, payload }) => (
                    <DistroTooltip
                      active={active}
                      label={label as string}
                      rows={(payload ?? []).map((p) => ({
                        name:
                          p.dataKey === "efectividad"
                            ? "Efectividad"
                            : p.dataKey === "ccc"
                              ? "CCC"
                              : "Cartera activa",
                        value:
                          p.dataKey === "efectividad"
                            ? `${p.value}%`
                            : Number(p.value).toLocaleString("es-AR"),
                        color: p.color as string,
                      }))}
                    />
                  )}
                />
                <Bar dataKey="cartera" name="Cartera activa" fill={GRAY_LIGHT} radius={[3, 3, 0, 0]} animationDuration={1200} />
                <Bar dataKey="ccc" name="CCC" fill={ACCENT} radius={[3, 3, 0, 0]} animationDuration={1300} />
                <Line yAxisId="right" type="monotone" dataKey="efectividad" name="Efectividad" stroke={ACCENT_DARK} strokeWidth={2} dot={{ r: 2.5, fill: ACCENT_DARK }} animationDuration={1500} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <Legend
          items={[
            { label: "Cartera activa", color: GRAY_LIGHT },
            { label: "CCC", color: ACCENT },
            { label: "Efectividad %", color: ACCENT_DARK },
          ]}
        />
      </div>

      {/* Mix de categorías */}
      <div className="chart-card">
        <div className="chart-head">
          <span className="chart-title">Mix de categorías</span>
        </div>
        <p className="chart-sub">Participación sobre facturación total</p>
        <div style={{ height: 240 }}>
          {visible && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={mix} margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#00000010" horizontal={false} />
                <XAxis type="number" domain={[0, "dataMax"]} {...axisProps} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="cat" {...axisProps} width={92} />
                <Tooltip
                  cursor={{ fill: "#00000008" }}
                  content={({ active, label, payload }) => (
                    <DistroTooltip
                      active={active}
                      label={label as string}
                      rows={(payload ?? []).map((p) => ({
                        name: "Participación",
                        value: `${p.value}%`,
                        color: (p.payload as { color: string }).color,
                      }))}
                    />
                  )}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]} animationDuration={1300}>
                  {mix.map((m) => (
                    <Cell key={m.cat} fill={m.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
