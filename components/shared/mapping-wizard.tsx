"use client";

import { Fragment, useRef, useState, useTransition } from "react";

import { subirArchivo, confirmarMapeo, type SubirArchivoResult } from "@/app/[tenant]/(app)/admin/actions";
import { CAMPOS_DISTRO, type CampoDistro } from "@/lib/pipeline/fields";
import type { ProcessResult } from "@/lib/pipeline";

type Step = "upload" | "mapping" | "done";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Subir archivo" },
  { key: "mapping", label: "Mapear columnas" },
  { key: "done", label: "Resultado" },
];

export function MappingWizard({ slug }: { slug: string }) {
  const [step, setStep] = useState<Step>("upload");
  const [data, setData] = useState<SubirArchivoResult | null>(null);
  const [mapeo, setMapeo] = useState<Partial<Record<CampoDistro, string>>>({});
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const stepIdx = STEPS.findIndex((s) => s.key === step);

  function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      try {
        const res = await subirArchivo(slug, fd);
        setData(res);
        setMapeo(res.mapeoSugerido);
        setStep("mapping");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function onConfirm() {
    if (!data) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await confirmarMapeo(slug, data.uploadId, mapeo);
        setResult(res);
        setStep("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function reset() {
    setStep("upload");
    setData(null);
    setResult(null);
    setFile(null);
  }

  return (
    <div className="card space-y-5">
      {/* Stepper */}
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <Fragment key={s.key}>
            <div className={`wizard-step ${i === stepIdx ? "active" : i < stepIdx ? "done" : ""}`}>
              <span className="wizard-step-num">
                {i < stepIdx ? <i className="ti ti-check" /> : i + 1}
              </span>
              {s.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`wizard-step-line ${i < stepIdx ? "done" : ""}`} />
            )}
          </Fragment>
        ))}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {step === "upload" && (
        <form onSubmit={onUpload} className="space-y-4">
          <label
            className="drop-zone block"
            style={dragging ? { background: "var(--accent-light)" } : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <i className="ti ti-file-spreadsheet text-3xl" style={{ color: "var(--accent)" }} />
            <p className="mt-2 text-sm font-medium">
              Arrastrá tu Excel o hacé click para seleccionar
            </p>
            <p className="mt-1 text-xs text-gray-400">.xlsx, .xls o .csv</p>
            {file && (
              <span className="tag-pill mt-3">
                <i className="ti ti-paperclip" />
                {file.name}
              </span>
            )}
          </label>
          <button type="submit" disabled={pending || !file} className="btn-accent disabled:opacity-50">
            {pending ? "Analizando…" : "Analizar archivo"}
          </button>
        </form>
      )}

      {step === "mapping" && data && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {data.filename} · {data.totalFilas} filas. Asigná cada campo de Distro a una columna de
            tu archivo.
          </p>
          <div className="flex items-center gap-3 px-1 text-[11px] uppercase tracking-wide text-gray-400">
            <span className="flex-1">Tu archivo</span>
            <span className="w-5" />
            <span className="w-40">Campo Distro</span>
          </div>
          <div className="space-y-3">
            {CAMPOS_DISTRO.map((campo) => {
              const colSel = mapeo[campo.campo];
              const muestras = data.columnas.find((c) => c.nombre === colSel)?.muestras;
              return (
                <div key={campo.campo} className="flex items-start gap-3">
                  <div className="flex-1">
                    <select
                      value={colSel ?? ""}
                      onChange={(e) =>
                        setMapeo((m) => ({ ...m, [campo.campo]: e.target.value || undefined }))
                      }
                      className="input-distro"
                    >
                      <option value="">— sin asignar —</option>
                      {data.columnas.map((c) => (
                        <option key={c.nombre} value={c.nombre}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                    {muestras && muestras.length > 0 && (
                      <p className="mt-1 truncate text-xs text-gray-400">
                        ej: {muestras.slice(0, 3).join(" · ")}
                      </p>
                    )}
                  </div>
                  <i className="ti ti-arrow-right mt-2.5 text-gray-300" />
                  <div className="w-40 pt-2 text-sm font-medium">
                    {campo.label}
                    {campo.requerido && <span className="text-red-500"> *</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={onConfirm} disabled={pending} className="btn-accent disabled:opacity-50">
            {pending ? "Procesando…" : "Confirmar y procesar"}
          </button>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {result.errores.length > 0 ? (
              <>
                <i className="ti ti-alert-triangle text-xl" style={{ color: "#d85a30" }} />
                <p className="font-medium" style={{ color: "#b0431f" }}>
                  Carga procesada con avisos
                </p>
              </>
            ) : (
              <>
                <i className="ti ti-circle-check text-xl" style={{ color: "#1f7a4f" }} />
                <p className="font-medium" style={{ color: "#1f7a4f" }}>
                  Carga procesada correctamente
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Filas leídas" value={result.rowsProcesadas} />
            <Metric label="Insertadas" value={result.insertadas} />
            <Metric label="Duplicadas" value={result.duplicadas} />
            <Metric label="Errores" value={result.errores.length} alerta={result.errores.length > 0} />
          </div>

          {result.errores.length > 0 && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer">Ver primeros errores</summary>
              <ul className="mt-1 space-y-0.5">
                {result.errores.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    Fila {e.row} · {e.campo}: {e.motivo} ({String(e.valor)})
                  </li>
                ))}
              </ul>
            </details>
          )}

          <button onClick={reset} className="btn-ghost">
            Cargar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, alerta }: { label: string; value: number; alerta?: boolean }) {
  return (
    <div className="card" style={{ padding: "0.85rem 1rem" }}>
      <p className="kpi-value" style={alerta && value > 0 ? { color: "#b0431f" } : undefined}>
        {value}
      </p>
      <p className="kpi-label mt-1">{label}</p>
    </div>
  );
}
