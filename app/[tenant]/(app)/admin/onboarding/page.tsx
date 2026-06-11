import { redirect } from "next/navigation";

import { tenantServerClient } from "@/lib/supabase/tenant-server";
import { getSession } from "@/lib/auth/session";
import { resolveTenant, toPublicConfig } from "@/lib/supabase/tenant-resolver";
import { OnboardingConfig } from "@/components/shared/onboarding-config";
import { MappingWizard } from "@/components/shared/mapping-wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  params,
}: {
  params: { tenant: string };
}) {
  const session = await getSession(params.tenant);
  if (!session || !["admin", "super_admin"].includes(session.appUser.rol)) {
    redirect(`/${params.tenant}/dashboard`);
  }

  const { client } = await tenantServerClient(params.tenant);
  const tenant = toPublicConfig(await resolveTenant(params.tenant));

  const [rubros, equipos, vendedores] = await Promise.all([
    client.from("rubros").select("id, nombre").order("nombre"),
    client.from("equipos").select("id, nombre").order("nombre"),
    client.from("vendedores").select("id, nombre, equipo_id").order("nombre"),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="section-title">Onboarding</h1>
        <p className="text-sm text-gray-500">
          Configurá {tenant.nombre} sin tocar código.
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="step-indicator">1</span>
          <div>
            <h2 className="text-base font-medium">Configuración</h2>
            <p className="text-sm text-gray-500">
              Cargá rubros, equipos y vendedores. Es la base que usan los demás módulos.
            </p>
          </div>
        </div>
        <OnboardingConfig
          slug={params.tenant}
          rol={session.appUser.rol}
          data={{
            rubros: rubros.data ?? [],
            equipos: equipos.data ?? [],
            vendedores: vendedores.data ?? [],
            modulosActivos: tenant.modulosActivos,
          }}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="step-indicator">2</span>
          <div>
            <h2 className="text-base font-medium">Primer Excel + histórico</h2>
            <p className="text-sm text-gray-500">
              Subí el Excel de ventas. El mapeo se guarda y se reaplica en cargas
              futuras. Para histórico retroactivo, subí los archivos de meses
              anteriores: el pipeline deduplica e Intelligence tendrá base desde el
              día 1.
            </p>
          </div>
        </div>
        <MappingWizard slug={params.tenant} />
      </section>
    </div>
  );
}
