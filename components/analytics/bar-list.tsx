import { formatMoneda } from "@/lib/utils";

export function BarList({
  items,
}: {
  items: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <ul className="space-y-2">
      {items.length === 0 && (
        <li className="text-sm text-gray-400">Sin datos en el período.</li>
      )}
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="truncate text-gray-700">{item.label}</span>
            <span className="ml-2 font-medium tabular-nums text-gray-900">
              {formatMoneda(item.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${(Math.abs(item.value) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
