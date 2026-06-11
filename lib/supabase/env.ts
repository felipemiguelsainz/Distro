/**
 * Validación de variables de entorno requeridas.
 * Falla rápido (en build/boot) si falta algo crítico.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `[distro] Falta la variable de entorno requerida: ${name}. Ver .env.example`,
    );
  }
  return value;
}

export const env = {
  master: {
    url: required(
      "NEXT_PUBLIC_MASTER_SUPABASE_URL",
      process.env.NEXT_PUBLIC_MASTER_SUPABASE_URL,
    ),
    anonKey: required(
      "NEXT_PUBLIC_MASTER_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_MASTER_SUPABASE_ANON_KEY,
    ),
    // Solo disponible server-side.
    serviceRoleKey: process.env.MASTER_SUPABASE_SERVICE_ROLE_KEY,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
  },
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

/** Acceso al service role de la maestra, garantizando contexto server. */
export function masterServiceRoleKey(): string {
  if (typeof window !== "undefined") {
    throw new Error(
      "[distro] El service role de la maestra no puede usarse en el browser.",
    );
  }
  return required(
    "MASTER_SUPABASE_SERVICE_ROLE_KEY",
    process.env.MASTER_SUPABASE_SERVICE_ROLE_KEY,
  );
}
