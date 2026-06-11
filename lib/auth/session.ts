import "server-only";

import { tenantServerClient } from "@/lib/supabase/tenant-server";
import type { AppUser, UserRole } from "@/lib/supabase/types";

export interface SessionContext {
  /** Usuario de auth del tenant. */
  authUserId: string;
  email: string | null;
  /** Fila de `app_users` con rol y scoping. */
  appUser: AppUser;
}

/**
 * Devuelve la sesión + el perfil de aplicación (rol, equipo, vendedor) del
 * usuario actual dentro de un tenant. Null si no hay sesión válida.
 */
export async function getSession(slug: string): Promise<SessionContext | null> {
  const { client } = await tenantServerClient(slug);

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const { data: appUser, error } = await client
    .from("app_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("activo", true)
    .maybeSingle();

  if (error || !appUser) return null;

  return {
    authUserId: user.id,
    email: user.email ?? null,
    appUser,
  };
}

/** Lanza si no hay sesión o si el rol no está permitido. */
export async function requireRole(
  slug: string,
  allowed: UserRole[],
): Promise<SessionContext> {
  const session = await getSession(slug);
  if (!session) throw new UnauthorizedError("Sesión requerida");
  if (!allowed.includes(session.appUser.rol)) {
    throw new ForbiddenError(
      `Rol "${session.appUser.rol}" no autorizado para esta acción`,
    );
  }
  return session;
}

export class UnauthorizedError extends Error {
  name = "UnauthorizedError";
}
export class ForbiddenError extends Error {
  name = "ForbiddenError";
}
