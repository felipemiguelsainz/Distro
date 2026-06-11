"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { tenantBrowserClient } from "@/lib/supabase/tenant-browser";
import type { TenantPublicConfig } from "@/lib/supabase/tenant-resolver";
import type { TenantDatabase, DistroModule } from "@/lib/supabase/types";

interface TenantContextValue {
  config: TenantPublicConfig;
  supabase: SupabaseClient<TenantDatabase>;
  hasModule: (m: DistroModule) => boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  config,
  children,
}: {
  config: TenantPublicConfig;
  children: ReactNode;
}) {
  const value = useMemo<TenantContextValue>(() => {
    const supabase = tenantBrowserClient(config);
    return {
      config,
      supabase,
      hasModule: (m) => config.modulosActivos.includes(m),
    };
  }, [config]);

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant debe usarse dentro de <TenantProvider>");
  }
  return ctx;
}
