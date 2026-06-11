import { cn } from "@/lib/utils";
import type { Segmento } from "@/lib/supabase/types";

const ESTILOS: Record<Segmento, { label: string; clase: string }> = {
  estrella: { label: "Estrella", clase: "bg-violet-100 text-violet-700" },
  crecimiento: { label: "En crecimiento", clase: "bg-green-100 text-green-700" },
  estable: { label: "Estable", clase: "bg-sky-100 text-sky-700" },
  riesgo: { label: "En riesgo", clase: "bg-amber-100 text-amber-700" },
  dormido: { label: "Dormido", clase: "bg-red-100 text-red-700" },
};

export function SegmentoBadge({ segmento }: { segmento: Segmento | null }) {
  if (!segmento) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
        Sin datos
      </span>
    );
  }
  const e = ESTILOS[segmento];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", e.clase)}>
      {e.label}
    </span>
  );
}
