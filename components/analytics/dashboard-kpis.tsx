"use client";

import { useEffect, useRef, useState } from "react";

import type { KpiItem, SupRow, Tendencia } from "@/lib/analytics/dashboard-view";

const DURACION = 1400;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Anima el número final de un KPI haciéndolo "contar" desde 0.
 * Detecta dígitos dentro del string ya formateado (ej. "$12.4M") y los escala
 * por el progreso, preservando prefijos/sufijos.
 */
function valorAnimado(value: string, progress: number): string {
  if (progress >= 1) return value;
  return value.replace(/[\d.,]+/, (num) => {
    const decimals = num.includes(".") ? num.split(".")[1].replace(/\D/g, "").length : 0;
    const limpio = Number(num.replace(/\./g, decimals > 0 ? "." : "").replace(/,/g, ""));
    const n = (Number.isFinite(limpio) ? limpio : 0) * progress;
    return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString("es-AR");
  });
}

/** Clase de color para la barra del KPI según su performance vs avance esperado. */
function perfClass(p?: number): string {
  if (p == null) return "";
  if (p >= 100) return "perf-ok";
  if (p >= 85) return "perf-warn";
  return "perf-bad";
}

/** Badge de tendencia (columna "Tend." de la tabla de supervisores). */
function tendBadge(pct: number): { cls: string; icon: string; text: string } {
  if (pct > 100) return { cls: "adelantado", icon: "ti-arrow-up", text: "Adelantado" };
  if (pct >= 90) return { cls: "enlinea", icon: "ti-minus", text: "En línea" };
  return { cls: "atrasado", icon: "ti-arrow-down", text: "Atrasado" };
}

function DeltaBadge({ value, label }: { value: number; label: string }) {
  const up = value >= 0;
  return (
    <span className={`dp-delta ${up ? "up" : "down"}`}>
      <i className={`ti ${up ? "ti-arrow-up" : "ti-arrow-down"}`} />
      {up ? "+" : ""}
      {value}% {label}
    </span>
  );
}

export function DashboardKpis({
  kpis,
  supervisores,
  tendencia,
}: {
  kpis: KpiItem[];
  supervisores: SupRow[];
  tendencia: Tendencia;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !revealed) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [revealed]);

  useEffect(() => {
    if (!revealed) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURACION);
      setProgress(easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [revealed]);

  const esperadoPct = Math.round(tendencia.pctMes * 100);

  return (
    <div ref={ref} className="space-y-4">
      <div className="dp-kpi-grid">
        {kpis.map((k) => (
          <div className="dp-kpi" key={k.label}>
            <p className="dp-kpi-label">{k.label}</p>
            <p className="dp-kpi-value">{valorAnimado(k.value, progress)}</p>
            {k.badge && (
              <span className={`dp-badge${k.neg ? " neg" : ""}`}>
                <i className={`ti ${k.neg ? "ti-trending-down" : "ti-trending-up"}`} />
                {k.badge}
              </span>
            )}
            {k.proyeccion && <p className="dp-kpi-proy">{k.proyeccion}</p>}
            {(k.deltaMesAnt != null || k.deltaAnioAnt != null) && (
              <div className="dp-deltas">
                {k.deltaMesAnt != null && <DeltaBadge value={k.deltaMesAnt} label="vs mes ant." />}
                {k.deltaAnioAnt != null && <DeltaBadge value={k.deltaAnioAnt} label="vs año ant." />}
              </div>
            )}
            {/* Marcador de avance esperado según días hábiles del mes. */}
            {k.performance != null && (
              <span className="dp-kpi-esperado" style={{ left: `${esperadoPct}%` }} />
            )}
            <span
              className={`dp-kpi-bar ${perfClass(k.performance)}`}
              style={{ width: revealed ? `${k.bar}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      <div className="dp-table-wrap with-tend">
        <div className="dp-table-head">
          <span>Equipo</span>
          <span>Facturación YTD</span>
          <span>CCC</span>
          <span>Avance vs meta</span>
          <span>Tend.</span>
        </div>
        {supervisores.map((s) => {
          const tend = tendBadge(s.tendPct);
          return (
            <div className="dp-sup-row" key={s.nombre}>
              <span className="dp-sup-name">{s.nombre}</span>
              <span className="dp-sup-num">{s.ytd}</span>
              <span className="dp-sup-num">{s.ccc}</span>
              <div className="dp-sup-bar">
                <div className="dp-sup-track">
                  <div
                    className={`dp-sup-fill ${perfClass(s.tendPct)}`}
                    style={{ width: revealed ? `${s.pct}%` : "0%" }}
                  />
                </div>
                <span className="dp-sup-pct">{s.pct}%</span>
              </div>
              <span>
                <span className={`dp-tend ${tend.cls}`}>
                  <i className={`ti ${tend.icon}`} />
                  {tend.text}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
