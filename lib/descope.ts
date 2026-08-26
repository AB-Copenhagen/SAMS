// Server-side Descope session validation using core-js-sdk.
// The me() call hits GET /v1/auth/me with Authorization: Bearer <projectId>:<sessionJwt>.
import createSdk from '@descope/core-js-sdk';

export type DescopeSession = {
  id: string;
  email: string;
  name?: string;
  roles?: string[];
};

export type AppRole = 'ADMIN' | 'STAFF';

// Descope role names (Console → Roles) that grant access to media.ab.dk, in priority order.
// Overridable per-project since the codebase itself has no opinion on what they're called there.
const ADMIN_ROLE_NAME = process.env.DESCOPE_ADMIN_ROLE ?? 'Admin';
const STAFF_ROLE_NAME = process.env.DESCOPE_STAFF_ROLE ?? 'Staff';

// Login gate: a user must hold one of these Descope roles to use the app at all, and which one
// they hold sets their in-app privilege level. Replaces the old ADMIN_EMAILS allowlist — access
// is now managed entirely in the Descope console (assign/revoke a role) instead of an env var
// redeploy. Admin implies staff-level access, so check it first.
export function resolveAppRole(roleNames: string[] | undefined): AppRole | null {
  const roles = roleNames ?? [];
  if (roles.includes(ADMIN_ROLE_NAME)) return 'ADMIN';
  if (roles.includes(STAFF_ROLE_NAME)) return 'STAFF';
  return null;
}

const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;

let _sdk: ReturnType<typeof createSdk> | undefined;

function getSdk() {
  if (!projectId) throw new Error('NEXT_PUBLIC_DESCOPE_PROJECT_ID is not set');
  if (!_sdk) _sdk = createSdk({ projectId });
  return _sdk;
}

export async function verifyDescopeSession(sessionToken: string): Promise<DescopeSession | null> {
  try {
    const { ok, data } = await getSdk().me(sessionToken);
    if (!ok || !data) return null;
    return {
      id: data.userId,
      email: data.email ?? data.loginIds?.[0] ?? '',
      name: data.name,
      roles: data.roleNames ?? [],
    };
  } catch {
    return null;
  }
}
