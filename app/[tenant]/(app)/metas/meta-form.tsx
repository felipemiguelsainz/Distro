"use client";

import { useState, useTransition } from "react";

import { guardarMeta } from "./actions";
import { formatMoneda } from "@/lib/utils";
import { performanceVsMeta } from "@/lib/analytics/dias-habiles";

export interface MetaRow {
  equipoId: string;
  equipoNombre: string;
  cccObjetivo: number;
  cccActual: number;
  facturacionObjetivo: number | null;
}

/** Clase de color de la barra según performance vs avance esperado del mes. */
function perfClass(performance: number): string {
  if (performance >= 100) return "perf-ok";
  if (performance >= 85) return "perf-warn";
  return "perf-bad";
}

export function MetaForm({
  slug,
  periodo,
  metas,
}: {
  slug: string;
  periodo: string;
  metas: MetaRow[];
}) {
  return (
    <div className="dp-table-wrap metas">
      <div className="dp-table-head">
        <span>Equipo</span>
        <span>Avance CCC</span>
        <span>Meta CCC</span>
        <span></span>
      </div>
      {metas.map((m) => (
        <MetaRowForm key={m.equipoId} slug={slug} periodo={periodo} meta={m} />
      ))}
      {metas.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          No hay equipos con metas para este período.
        </div>
      )}
    </div>
  );
}

function MetaRowForm({
  slug,
  periodo,
  meta,
}: {
  slug: string;
  periodo: string;
  meta: MetaRow;
}) {
  const [ccc, setCcc] = useState(meta.cccObjetivo);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await guardarMeta(slug, {
        equipoId: meta.equipoId,
        periodo,
        cccObjetivo: ccc,
        facturacionObjetivo: meta.facturacionObjetivo,
      });
      setMsg(res.ok ? "Guardado" : `Error: ${res.error}`);
    });
  }

  const avance = ccc > 0 ? Math.min(100, Math.round((meta.cccActual / ccc) * 100)) : 0;
  const performance = ccc > 0 ? performanceVsMeta(meta.cccActual, ccc) : 0;

  return (
    <div className="dp-sup-row">
      <span className="dp-sup-name">
        {meta.equipoNombre}
        <span className="block text-xs font-normal text-gray-400">
          {meta.cccActual} clientes actuales
          {meta.facturacionObjetivo != null && (
            <> · meta fact. {formatMoneda(meta.facturacionObjetivo)}</>
          )}
        </span>
      </span>

      <div className="dp-sup-bar">
        <div className="dp-sup-track">
          <div
            className={`dp-sup-fill ${perfClass(performance)}`}
            style={{ width: `${avance}%` }}
          />
        </div>
        <span className="dp-sup-pct">{avance}%</span>
      </div>

      <input
        type="number"
        min={0}
        value={ccc}
        onChange={(e) => setCcc(Number(e.target.value))}
        className="input-distro w-24"
        aria-label={`Meta CCC ${meta.equipoNombre}`}
      />

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={pending} className="btn-accent disabled:opacity-50">
          {pending ? "…" : "Guardar"}
        </button>
        {msg && <span className="whitespace-nowrap text-xs text-gray-500">{msg}</span>}
      </div>
    </div>
  );
}
