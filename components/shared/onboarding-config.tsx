"use client";

import { useState, useTransition } from "react";

import {
  agregarEquipo,
  agregarRubro,
  agregarVendedor,
  actualizarModulos,
} from "@/app/[tenant]/(app)/admin/onboarding/actions";
import type { DistroModule, UserRole } from "@/lib/supabase/types";

const MODULOS: { key: DistroModule; label: string }[] = [
  { key: "analytics", label: "Analytics" },
  { key: "intelligence", label: "Intelligence" },
  { key: "rutas", label: "Rutas" },
  { key: "metas", label: "Metas" },
  { key: "chat", label: "Chat IA" },
];

export interface OnboardingData {
  rubros: { id: string; nombre: string }[];
  equipos: { id: string; nombre: string }[];
  vendedores: { id: string; nombre: string; equipo_id: string | null }[];
  modulosActivos: string[];
}

export function OnboardingConfig({
  slug,
  rol,
  data,
}: {
  slug: string;
  rol: UserRole;
  data: OnboardingData;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ListaSimple
        titulo="Rubros / categorías"
        items={data.rubros}
        onAdd={(nombre) => agregarRubro(slug, nombre)}
        placeholder="Ej: Bebidas"
      />
      <ListaSimple
        titulo="Equipos"
        items={data.equipos}
        onAdd={(nombre) => agregarEquipo(slug, nombre)}
        placeholder="Ej: Equipo Norte"
      />
      <VendedoresSection slug={slug} data={data} />
      {rol === "super_admin" && (
        <ModulosSection slug={slug} activos={data.modulosActivos} />
      )}
    </div>
  );
}

function ListaSimple({
  titulo,
  items,
  onAdd,
  placeholder,
}: {
  titulo: string;
  items: { id: string; nombre: string }[];
  onAdd: (nombre: string) => Promise<{ ok: boolean; error?: string }>;
  placeholder: string;
}) {
  const [nombre, setNombre] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!nombre.trim()) return;
    setError(null);
    start(async () => {
      const res = await onAdd(nombre);
      if (res.ok) setNombre("");
      else setError(res.error ?? "Error");
    });
  }

  return (
    <div className="card card-hover">
      <h3 className="mb-3 text-sm font-medium text-gray-700">{titulo}</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i.id} className="tag-pill">
            {i.nombre}
          </span>
        ))}
        {items.length === 0 && <span className="text-sm text-gray-400">Vacío</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={placeholder}
          className="input-distro flex-1"
        />
        <button onClick={add} disabled={pending} className="btn-accent disabled:opacity-50">
          Agregar
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function VendedoresSection({ slug, data }: { slug: string; data: OnboardingData }) {
  const [nombre, setNombre] = useState("");
  const [equipoId, setEquipoId] = useState<string>("");
  const [pending, start] = useTransition();

  function add() {
    if (!nombre.trim()) return;
    start(async () => {
      const res = await agregarVendedor(slug, {
        nombre,
        equipoId: equipoId || null,
      });
      if (res.ok) setNombre("");
    });
  }

  const equipoNombre = (id: string | null) =>
    data.equipos.find((e) => e.id === id)?.nombre ?? "—";

  return (
    <div className="card card-hover">
      <h3 className="mb-3 text-sm font-medium text-gray-700">Vendedores</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {data.vendedores.map((v) => (
          <span key={v.id} className="tag-pill">
            {v.nombre}
            <span className="text-xs text-gray-400">· {equipoNombre(v.equipo_id)}</span>
          </span>
        ))}
        {data.vendedores.length === 0 && <span className="text-sm text-gray-400">Vacío</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del vendedor"
          className="input-distro flex-1"
        />
        <select
          value={equipoId}
          onChange={(e) => setEquipoId(e.target.value)}
          className="input-distro w-auto"
        >
          <option value="">Sin equipo</option>
          {data.equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <button onClick={add} disabled={pending} className="btn-accent disabled:opacity-50">
          Agregar
        </button>
      </div>
    </div>
  );
}

function ModulosSection({ slug, activos }: { slug: string; activos: string[] }) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(activos));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(m: DistroModule) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }

  function guardar() {
    setMsg(null);
    start(async () => {
      const res = await actualizarModulos(slug, [...seleccion] as DistroModule[]);
      setMsg(res.ok ? "Guardado" : `Error: ${res.error}`);
    });
  }

  return (
    <div className="card card-hover">
      <h3 className="mb-3 text-sm font-medium text-gray-700">
        Módulos activos (plataforma)
      </h3>
      <div className="space-y-2.5">
        {MODULOS.map((m) => (
          <label key={m.key} className="flex items-center justify-between text-sm">
            <span>{m.label}</span>
            <input
              type="checkbox"
              className="toggle-switch"
              checked={seleccion.has(m.key)}
              onChange={() => toggle(m.key)}
            />
          </label>
        ))}
      </div>
      <button onClick={guardar} disabled={pending} className="btn-accent mt-4 disabled:opacity-50">
        Guardar módulos
      </button>
      {msg && <p className="mt-2 text-xs text-gray-500">{msg}</p>}
    </div>
  );
}
