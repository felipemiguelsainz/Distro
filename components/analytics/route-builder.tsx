"use client";

import { useMemo, useState } from "react";

import type { PdvConSalud } from "@/lib/analytics/pdvs";
import { distanciaKm, googleMapsPunto, googleMapsRuta } from "@/lib/maps";
import { SegmentoBadge } from "@/components/shared/segmento-badge";
import { cn } from "@/lib/utils";

/** Radio (km) para densificar la ruta con clientes cercanos. */
const RADIO_DENSIFICACION_KM = 3;

function necesitaVisita(p: PdvConSalud): boolean {
  return (
    p.compraVencida ||
    (p.scoreSalud != null && p.scoreSalud < 45) ||
    p.segmento === "riesgo" ||
    p.segmento === "dormido"
  );
}

export function RouteBuilder({ pdvs }: { pdvs: PdvConSalud[] }) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const conCoords = pdvs.filter((p) => p.lat != null && p.lon != null);

  function toggle(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const rutaUrl = useMemo(() => {
    const puntos = conCoords
      .filter((p) => seleccion.has(p.id))
      .map((p) => ({ lat: p.lat!, lon: p.lon!, nombre: p.nombre }));
    return googleMapsRuta(puntos);
  }, [seleccion, conCoords]);

  // Densificación inteligente: PDVs no seleccionados que necesitan visita y
  // están cerca de algún punto de la ruta actual. Maximiza valor de la salida.
  const sugeridos = useMemo(() => {
    const seleccionados = conCoords.filter((p) => seleccion.has(p.id));
    if (seleccionados.length === 0) return [];
    return conCoords
      .filter((p) => !seleccion.has(p.id) && necesitaVisita(p))
      .map((p) => {
        const dist = Math.min(
          ...seleccionados.map((s) =>
            distanciaKm({ lat: p.lat!, lon: p.lon! }, { lat: s.lat!, lon: s.lon! }),
          ),
        );
        return { pdv: p, dist };
      })
      .filter((x) => x.dist <= RADIO_DENSIFICACION_KM)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);
  }, [seleccion, conCoords]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {seleccion.size} PDV seleccionados · {conCoords.length} con
          ubicación
        </p>
        <a
          href={rutaUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!rutaUrl}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium text-white",
            rutaUrl
              ? "bg-brand-600 hover:bg-brand-700"
              : "pointer-events-none bg-gray-300",
          )}
        >
          Abrir ruta optimizada en Google Maps
        </a>
      </div>

      {sugeridos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            Densificación: {sugeridos.length} clientes cercanos conviene sumar
          </p>
          <ul className="mt-2 space-y-1.5">
            {sugeridos.map(({ pdv, dist }) => (
              <li
                key={pdv.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">
                  {pdv.nombre}
                  <span className="ml-2 text-xs text-amber-700">
                    a {dist.toFixed(1)} km · {pdv.compraVencida ? "compra vencida" : `score ${pdv.scoreSalud ?? "?"}`}
                  </span>
                </span>
                <button
                  onClick={() => toggle(pdv.id)}
                  className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
                >
                  Sumar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {pdvs.map((p) => {
          const sinCoords = p.lat == null || p.lon == null;
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                disabled={sinCoords}
                checked={seleccion.has(p.id)}
                onChange={() => toggle(p.id)}
                className="h-4 w-4"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {p.nombre}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {p.clienteNombre ?? "—"}
                  {p.compraVencida && (
                    <span className="ml-2 font-medium text-amber-600">
                      compra vencida
                    </span>
                  )}
                  {p.diasSinCompra != null && (
                    <span className="ml-2 text-gray-400">
                      {p.diasSinCompra}d sin compra
                    </span>
                  )}
                </p>
              </div>
              <SegmentoBadge segmento={p.segmento} />
              {!sinCoords && (
                <a
                  href={googleMapsPunto({ lat: p.lat!, lon: p.lon! })}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Ver
                </a>
              )}
              {sinCoords && (
                <span className="text-xs text-gray-300">sin GPS</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
