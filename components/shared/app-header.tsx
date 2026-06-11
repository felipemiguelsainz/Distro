"use client";

import { usePathname } from "next/navigation";

import type { UserRole } from "@/lib/supabase/types";

const SECCIONES: { match: string; label: string }[] = [
  { match: "/dashboard", label: "Dashboard" },
  { match: "/intelligence", label: "Intelligence" },
  { match: "/rutas", label: "Rutas" },
  { match: "/metas", label: "Metas" },
  { match: "/chat", label: "Chat IA" },
  { match: "/admin", label: "Administración" },
];

/** Color de la pill de rol: admin → naranja, supervisor → azul, resto → gris. */
function rolClass(rol: UserRole): string {
  if (rol === "admin" || rol === "super_admin") return "admin";
  if (rol === "supervisor") return "supervisor";
  return "vendedor";
}

export function AppHeader({ nombre, rol }: { nombre: string; rol: UserRole }) {
  const pathname = usePathname();
  const seccion = SECCIONES.find((s) => pathname.includes(s.match))?.label ?? "Inicio";

  return (
    <header className="app-header">
      <div className="app-breadcrumb">
        <span>Distro</span>
        <i className="ti ti-chevron-right text-xs" />
        <span className="crumb-current">{seccion}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">{nombre}</span>
        <span className={`role-pill ${rolClass(rol)}`}>{rol.replace("_", " ")}</span>
      </div>
    </header>
  );
}
