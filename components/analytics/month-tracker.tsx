"use client";

import { useEffect, useRef, useState } from "react";

import type { Tendencia } from "@/lib/analytics/dashboard-view";

const fmtMoneda = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : `$${Math.round(n).toLocaleString("es-AR")}`;

/**
 * Barra de seguimiento del mes: avance (días hábiles transcurridos) sobre fondo
 * gris, con una línea punteada que marca el ritmo esperado, y un texto con la
 * proyección al cierre vs la meta del mes.
 */
export function MonthTracker({ tendencia }: { tendencia: Tendencia }) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const pct = Math.round(tendencia.pctMes * 100);
  // La meta del mes se deriva de la proyección y la performance:
  // performance = acumulado / esperado, y proyección ≈ meta * (performance/100).
  const meta =
    tendencia.performanceFacturacion > 0
      ? tendencia.proyeccionFacturacion / (tendencia.performanceFacturacion / 100)
      : tendencia.proyeccionFacturacion;

  return (
    <div ref={ref} className="dp-track-mes">
      <div className="mb-3 flex items-center justify-between">
        <span className="section-label">Seguimiento del mes</span>
        <span className="text-sm font-medium tabular-nums" style={{ color: "var(--accent-dark)" }}>
          {pct}%
        </span>
      </div>

      <div className="dp-track-wrap">
        <div className="dp-track-bar">
          <div className="dp-track-fill" style={{ width: revealed ? `${pct}%` : "0%" }} />
        </div>
        {/* Marcador del ritmo esperado según días hábiles transcurridos. */}
        <span className="dp-track-esperado" style={{ left: `${pct}%` }} />
      </div>

      <p className="dp-track-caption">
        Llevás el {pct}% del mes ({tendencia.diasTranscurridos} de {tendencia.diasTotales} días
        hábiles). Proyección al cierre: {fmtMoneda(tendencia.proyeccionFacturacion)}. Meta:{" "}
        {fmtMoneda(meta)}.
      </p>
    </div>
  );
}
