import type { ReactNode } from "react";

import { TenantProvider } from "@/components/shared/tenant-provider";
import {
  resolveTenant,
  toPublicConfig,
  TenantNotFoundError,
  type TenantPublicConfig,
} from "@/lib/supabase/tenant-resolver";

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenant: string };
}) {
  let config: TenantPublicConfig;
  try {
    const tenant = await resolveTenant(params.tenant);
    config = toPublicConfig(tenant);
  } catch (e) {
    return <SetupScreen slug={params.tenant} error={e} />;
  }

  return <TenantProvider config={config}>{children}</TenantProvider>;
}

/** Pantalla amable cuando el tenant no existe o falta provisionar la maestra. */
function SetupScreen({ slug, error }: { slug: string; error: unknown }) {
  const noEncontrado = error instanceof TenantNotFoundError;
  const msg = error instanceof Error ? error.message : String(error);
  const faltaSchema = /public\.tenants|schema cache|does not exist/i.test(msg);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-6">
      <div className="flex items-center gap-2.5">
        <span className="logo-mark">
          <i className="ti ti-chart-bar" />
        </span>
        <span className="text-base font-medium">Distro</span>
      </div>
      <div className="card bg-white">
        {noEncontrado ? (
          <>
            <h1 className="text-lg font-medium">Empresa no encontrada</h1>
            <p className="mt-1 text-sm text-gray-600">
              No existe un tenant con el slug{" "}
              <code className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">
                {slug}
              </code>
              , o está inactivo. Verificá la URL o registralo en la Supabase
              maestra.
            </p>
          </>
        ) : faltaSchema ? (
          <>
            <h1 className="text-lg font-medium">Configuración pendiente</h1>
            <p className="mt-1 text-sm text-gray-600">
              La base maestra todavía no tiene el schema de Distro. Corré{" "}
              <code className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">
                supabase/bootstrap.sql
              </code>{" "}
              en el SQL Editor y registrá el tenant{" "}
              <code className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">
                {slug}
              </code>
              .
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-medium">No se pudo cargar el tenant</h1>
            <p className="mt-1 break-words text-sm text-gray-600">{msg}</p>
          </>
        )}
      </div>
    </main>
  );
}
