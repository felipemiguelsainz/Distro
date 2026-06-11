"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTenant } from "./tenant-provider";
import { cn } from "@/lib/utils";
import type { DistroModule, UserRole } from "@/lib/supabase/types";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  module?: DistroModule;
  roles?: UserRole[];
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "ti-layout-dashboard", module: "analytics" },
  { label: "Intelligence", href: "/intelligence", icon: "ti-brain", module: "intelligence" },
  { label: "Rutas", href: "/rutas", icon: "ti-route", module: "rutas" },
  { label: "Metas", href: "/metas", icon: "ti-target", module: "metas", roles: ["admin", "supervisor"] },
  { label: "Chat IA", href: "/chat", icon: "ti-messages", module: "chat" },
  { label: "Admin", href: "/admin/onboarding", icon: "ti-settings", roles: ["admin", "super_admin"] },
];

export function Sidebar({ rol }: { rol: UserRole }) {
  const { config, hasModule } = useTenant();
  const pathname = usePathname();
  const base = `/${config.slug}`;

  const items = NAV.filter((item) => {
    if (item.module && !hasModule(item.module)) return false;
    if (item.roles && !item.roles.includes(rol)) return false;
    return true;
  });

  return (
    <aside className="app-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Image src="/logo-distro.png" alt="Distro" width={26} height={26} className="rounded-md" />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">Distro</p>
          <p className="truncate text-xs text-gray-500">{config.nombre}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {items.map((item) => {
          const href = `${base}${item.href}`;
          const active = pathname.startsWith(href);
          return (
            <div key={item.href}>
              {item.label === "Admin" && <div className="app-nav-sep" />}
              <Link href={href} className={cn("app-nav-item", active && "active")}>
                <i className={cn("ti", item.icon)} />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="app-sidebar-foot">Distro v1.0</div>
    </aside>
  );
}
