// Server-side Descope session validation using core-js-sdk.
// The me() call hits GET /v1/auth/me with Authorization: Bearer <projectId>:<sessionJwt>.
import createSdk from '@descope/core-js-sdk';

export type DescopeSession = {
  id: string;
  email: string;
  name?: string;
  roles?: string[];
};

export type AppRole = 'ADMIN' | 'STAFF' | 'USER';

// Descope role names (Console → Roles) that grant elevated in-app privilege, in priority order.
// Overridable per-project since the codebase itself has no opinion on what they're called there.
const ADMIN_ROLE_NAME = process.env.DESCOPE_ADMIN_ROLE ?? 'Admin';
const STAFF_ROLE_NAME = process.env.DESCOPE_STAFF_ROLE ?? 'Staff';

// Privilege level, not a login gate: every session that reaches this (already past the email
// domain check in the caller) gets at least USER. Admin implies staff-level access, so check it
// first.
export function resolveAppRole(roleNames: string[] | undefined): AppRole {
  const roles = roleNames ?? [];
  if (roles.includes(ADMIN_ROLE_NAME)) return 'ADMIN';
  if (roles.includes(STAFF_ROLE_NAME)) return 'STAFF';
  return 'USER';
}

// Login gate: only an @{ALLOWED_EMAIL_DOMAIN} email may use the app at all. Replaces the old
// ADMIN_EMAILS allowlist / role-required gate — anyone on the domain gets in by default now,
// with resolveAppRole above deciding their privilege level rather than whether they're let in.
const ALLOWED_EMAIL_DOMAIN = process.env.DESCOPE_ALLOWED_DOMAIN ?? 'ab.dk';

export function isAllowedEmailDomain(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN.toLowerCase()}`);
}

const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;

function requireProjectId(): string {
  if (!projectId) throw new Error('NEXT_PUBLIC_DESCOPE_PROJECT_ID is not set');
  return projectId;
}

let _sdk: ReturnType<typeof createSdk> | undefined;

function getSdk() {
  if (!_sdk) _sdk = createSdk({ projectId: requireProjectId() });
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

// listStaffUsers()/setUserRole() (gh-72, queried/wrote Descope's Management API directly) were
// removed in gh-76 — they hit Descope's rate limit on every /admin/users page view. Role/status
// now live in SAMS's own StaffUser roster (lib/staff-users.ts), not Descope. resolveAppRole/
// isAllowedEmailDomain above are kept as inert leftovers (gh-76 spec Question 4), not read by the
// login path anymore — see app/api/auth/session/route.ts.
