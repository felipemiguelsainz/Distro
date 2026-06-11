import { cn, formatPct } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg p-4" style={{ background: "var(--color-bg-secondary)" }}>
      <p className="kpi-label mb-2">{label}</p>
      <p className="kpi-value">{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {delta != null && (
          <span
            className={cn(
              "text-xs font-medium",
              delta >= 0 ? "text-brand-700" : "text-red-600",
            )}
          >
            {formatPct(delta)}
          </span>
        )}
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {/* Barra de acento inferior, como en la landing. */}
      <span
        className="absolute bottom-0 left-0 h-0.5"
        style={{ background: "var(--accent)", width: "100%" }}
      />
    </div>
  );
}
