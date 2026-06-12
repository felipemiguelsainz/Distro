"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { marcarAlertasLeidas } from "@/app/[tenant]/(app)/alertas/actions";
import type { Alerta, AlertaSeveridad } from "@/lib/supabase/types";

// Color del borde izquierdo de cada card según severidad
// (rojo alta, naranja media, azul baja) — igual que el email.
const SEV_COLOR: Record<AlertaSeveridad, string> = {
  alta: "#d85a30",
  media: "#ba7517",
  baja: "#378add",
};

/**
 * Badge + panel de alertas del día. Se monta junto al item Intelligence del
 * sidebar: muestra un punto naranja con el número de no leídas y, al hacer
 * click, despliega la lista con la misma estética de cards del email.
 */
export function AlertasPanel({ slug, alertas }: { slug: string; alertas: Alerta[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const noLeidas = alertas.filter((a) => !a.leida).length;

  function marcarTodas() {
    startTransition(async () => {
      await marcarAlertasLeidas(slug);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Alertas del día"
        className="relative flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100"
      >
        <i className="ti ti-bell text-[16px]" />
        {noLeidas > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white"
            style={{ background: "#ba7517" }}
          >
            {noLeidas}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute left-full top-0 z-50 ml-2 w-80 rounded-lg border bg-white shadow-lg"
               style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center justify-between border-b px-4 py-3"
                 style={{ borderColor: "var(--color-border)" }}>
              <span className="text-sm font-medium text-gray-900">Alertas de hoy</span>
              {noLeidas > 0 && (
                <button
                  type="button"
                  onClick={marcarTodas}
                  disabled={pending}
                  className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-50"
                >
                  {pending ? "Marcando…" : "Marcar todas como leídas"}
                </button>
              )}
            </div>

            <div className="max-h-96 space-y-2 overflow-auto p-3">
              {alertas.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="text-2xl leading-none" style={{ color: "#2f9e6a" }}>
                    ✓
                  </div>
                  <p className="mt-2 text-sm font-medium text-gray-700">Sin alertas hoy</p>
                </div>
              ) : (
                alertas.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border bg-white p-3"
                    style={{
                      borderColor: "var(--color-border)",
                      borderLeftWidth: 3,
                      borderLeftColor: SEV_COLOR[a.severidad],
                      opacity: a.leida ? 0.6 : 1,
                    }}
                  >
                    <p className="text-sm font-medium text-gray-900">{a.titulo}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{a.detalle}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
