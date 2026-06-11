import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/shared/sidebar";
import { AppHeader } from "@/components/shared/app-header";
import { getSession } from "@/lib/auth/session";

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

  return (
    <div className="flex min-h-screen">
      <Sidebar rol={session.appUser.rol} />
      <div className="flex flex-1 flex-col">
        <AppHeader nombre={session.appUser.nombre} rol={session.appUser.rol} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
