import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/shared/sidebar";
import { AppHeader } from "@/components/shared/app-header";
import { getSession } from "@/lib/auth/session";
import { getAlertasHoy } from "@/lib/alertas/queries";
import { tenantServerClient } from "@/lib/supabase/tenant-server";
import type { Alerta } from "@/lib/supabase/types";

export default async function AppShellLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenant: string };
}) {
  const session = await getSession(params.tenant);
  if (!session) {
    redirect(`/${params.tenant}/login`);
  }

  // Las alertas del día solo las ven supervisores/admins (la RLS las filtra).
  let alertas: Alerta[] = [];
  if (session.appUser.rol !== "vendedor") {
    const { client } = await tenantServerClient(params.tenant);
    alertas = await getAlertasHoy(client);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar rol={session.appUser.rol} alertas={alertas} />
      <div className="flex flex-1 flex-col">
        <AppHeader nombre={session.appUser.nombre} rol={session.appUser.rol} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
