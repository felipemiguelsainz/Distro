import { tenantServerClient } from "@/lib/supabase/tenant-server";
import { getPdvsConSalud } from "@/lib/analytics/pdvs";
import { RouteBuilder } from "@/components/analytics/route-builder";

export const dynamic = "force-dynamic";

export default async function RutasPage({
  params,
}: {
  params: { tenant: string };
}) {
  const { client } = await tenantServerClient(params.tenant);
  const pdvs = await getPdvsConSalud(client);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rutas</h1>
        <p className="text-sm text-gray-500">
          Armá una ruta y abrila optimizada en Google Maps. Los PDV con compra
          vencida o baja salud conviene incluirlos.
        </p>
      </div>
      <RouteBuilder pdvs={pdvs} />
    </div>
  );
}
