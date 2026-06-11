import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
      <div className="flex items-center gap-3">
        <span className="logo-mark" style={{ width: 36, height: 36, fontSize: 18 }}>
          <i className="ti ti-chart-bar" />
        </span>
        <h1 className="text-3xl font-medium tracking-tight">Distro</h1>
      </div>
      <p className="-mt-2 max-w-md text-lg text-gray-500">
        Gestión comercial e inteligencia de ventas para equipos en campo.
      </p>
      <div className="card max-w-md bg-white">
        <p className="text-sm text-gray-600">
          Accedé al espacio de tu empresa en{" "}
          <code className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">
            /tu-empresa
          </code>
        </p>
        <Link href="/demo/dashboard" className="btn-accent mt-4 inline-flex">
          Ir al dashboard
          <i className="ti ti-arrow-right" />
        </Link>
      </div>
    </main>
  );
}
