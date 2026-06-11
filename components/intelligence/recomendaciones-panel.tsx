"use client";

import { useState, useTransition } from "react";

import { regenerarRecomendaciones } from "@/app/[tenant]/(app)/intelligence/actions";
import type { Recomendacion } from "@/lib/supabase/types";
import { formatMoneda } from "@/lib/utils";

// La variante CSS (.recomendacion-card.<key>) define el color del borde izquierdo:
// recuperación → naranja, crecimiento → verde, cobertura → azul, alerta → rojo.
const CATEGORIAS: { key: Recomendacion["categoria"]; label: string }[] = [
  { key: "recuperacion", label: "Recuperación" },
  { key: "crecimiento", label: "Crecimiento" },
  { key: "cobertura", label: "Cobertura" },
  { key: "alerta", label: "Alertas" },
];

export function RecomendacionesPanel({
  slug,
  recomendaciones,
  puedeRegenerar,
}: {
  slug: string;
  recomendaciones: Recomendacion[];
  puedeRegenerar: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function regenerar() {
    setMsg(null);
    startTransition(async () => {
      const res = await regenerarRecomendaciones(slug);
      setMsg(
        res.ok ? `Generadas ${res.cantidad} recomendaciones.` : `Error: ${res.error}`,
      );
    });
  }

  const ordenadas = CATEGORIAS.flatMap((cat) =>
    recomendaciones
      .filter((r) => r.categoria === cat.key)
      .sort((a, b) => a.prioridad - b.prioridad)
      .map((r) => ({ r, cat })),
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <span className="section-label">Centro de Recomendaciones IA</span>
          <p className="text-sm text-gray-500">Acciones priorizadas, no métricas.</p>
        </div>
        {puedeRegenerar && (
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-gray-500">{msg}</span>}
            <button onClick={regenerar} disabled={pending} className="btn-accent disabled:opacity-50">
              {pending ? "Generando…" : "Regenerar"}
            </button>
          </div>
        )}
      </div>

      {ordenadas.length === 0 ? (
        <div className="card text-sm text-gray-500">
          Todavía no hay recomendaciones. {puedeRegenerar && "Generá las primeras con el botón."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ordenadas.map(({ r, cat }) => (
            <div key={r.id} className={`card recomendacion-card ${cat.key}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className="section-label">{cat.label}</span>
              </div>
              <p className="text-sm font-medium text-gray-900">{r.titulo}</p>
              <p className="text-sm text-gray-600">{r.detalle}</p>
              {r.impacto_estimado != null && (
                <p className="mt-1 text-xs font-medium" style={{ color: "#1f7a4f" }}>
                  Impacto estimado: {formatMoneda(r.impacto_estimado)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
