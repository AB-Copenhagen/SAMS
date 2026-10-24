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

    // Descope assigns a role either directly on the user (data.roleNames) or, in a project with
    // tenants, within a tenant membership (data.userTenants[].roleNames) — these are two
    // independent lists in the SDK's own types, not one nesting inside the other. AB's project
    // apparently uses the tenant-scoped form: reading only the top-level roleNames resolved to
    // nothing for every user, including ones that do hold Admin (gh-66). Combine both so either
    // assignment style works.
    const tenantRoles = (data.userTenants ?? []).flatMap((t) => t.roleNames ?? []);
    const roles = [...(data.roleNames ?? []), ...tenantRoles];

    // Temporary: confirms the real shape for any account that still resolves to zero roles after
    // the fix above (a genuine Descope-console assignment gap, as opposed to the tenant-shape
    // issue this fixes) — remove once gh-66 is confirmed resolved.
    if (roles.length === 0) {
      console.warn('[descope] no roles resolved', JSON.stringify({ userId: data.userId, roleNames: data.roleNames, userTenants: data.userTenants }));
    }

    return {
      id: data.userId,
      email: data.email ?? data.loginIds?.[0] ?? '',
      name: data.name,
      roles,
    };
  } catch {
    return null;
  }
}
