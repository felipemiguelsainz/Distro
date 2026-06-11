import { tenantServerClient } from "@/lib/supabase/tenant-server";
import { getAvanceCccPorEquipo, periodoActual } from "@/lib/analytics/queries";
import { MetaForm, type MetaRow } from "./meta-form";

export const dynamic = "force-dynamic";

const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** "2025-11" → "Noviembre 2025". */
function formatPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split("-");
  const idx = Number(mes) - 1;
  return idx >= 0 && idx < 12 ? `${MESES_LARGOS[idx]} ${anio}` : periodo;
}

export default async function MetasPage({
  params,
}: {
  params: { tenant: string };
}) {
  const { client } = await tenantServerClient(params.tenant);
  const periodo = periodoActual();

  const [avances, metasRes] = await Promise.all([
    getAvanceCccPorEquipo(client, periodo),
    client.from("metas").select("*").eq("periodo", periodo),
  ]);

  const facturacionPorEquipo = new Map(
    (metasRes.data ?? []).map((m) => [m.equipo_id, m.facturacion_objetivo]),
  );

  const metas: MetaRow[] = avances.map((a) => ({
    equipoId: a.equipoId,
    equipoNombre: a.equipoNombre,
    cccObjetivo: a.cccObjetivo,
    cccActual: a.cccActual,
    facturacionObjetivo: facturacionPorEquipo.get(a.equipoId) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="section-title">Metas</h1>
        <p className="text-sm text-gray-500">
          Cobertura de Clientes Compradores (CCC) · {formatPeriodo(periodo)}
        </p>
      </div>
      <MetaForm slug={params.tenant} periodo={periodo} metas={metas} />
    </div>
  );
}
