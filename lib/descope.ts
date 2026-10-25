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

function managementKey(): string {
  const key = process.env.DESCOPE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('DESCOPE_SERVICE_ACCOUNT_KEY is not set');
  return key;
}

function mgmtHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireProjectId()}:${managementKey()}`,
    'Content-Type': 'application/json',
  };
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

export type StaffUser = {
  userId: string;
  loginId: string;
  email: string;
  name: string | null;
  role: AppRole;
};

type RawStaffUser = {
  userId: string;
  email?: string;
  loginIds?: string[];
  name?: string;
  roleNames?: string[];
  userTenants?: { roleNames?: string[] }[];
};

const STAFF_USER_PAGE_SIZE = 100;

// Admin → Users (gh-72): lists the manageable users in THIS app's own staff project (not the
// consumer MyAB project — see lib/descope-customers.ts for that one), via the same Search Users
// Management API iterateAllCustomers there uses, resolving each one's privilege level the same
// way login does. Filtered to isAllowedEmailDomain — a user outside that domain can never log in
// (see app/api/auth/session/route.ts), so they'd be unmanageable noise on this page.
export async function listStaffUsers(): Promise<StaffUser[]> {
  const users: StaffUser[] = [];
  let page = 0;
  for (;;) {
    const res = await fetch('https://api.descope.com/v2/mgmt/user/search', {
      method: 'POST',
      headers: mgmtHeaders(),
      body: JSON.stringify({ limit: STAFF_USER_PAGE_SIZE, page }),
    });

    if (!res.ok) {
      throw new Error(`Descope user search failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { users: RawStaffUser[] };
    if (!data.users?.length) break;

    for (const raw of data.users) {
      const loginId = raw.loginIds?.[0] ?? raw.email ?? raw.userId;
      const email = raw.email ?? loginId;
      if (!isAllowedEmailDomain(email)) continue; // can never log in — not a manageable staff user

      const tenantRoles = (raw.userTenants ?? []).flatMap((t) => t.roleNames ?? []);
      users.push({
        userId: raw.userId,
        loginId,
        email,
        name: raw.name ?? null,
        role: resolveAppRole([...(raw.roleNames ?? []), ...tenantRoles]),
      });
    }

    if (data.users.length < STAFF_USER_PAGE_SIZE) break;
    page++;
  }
  return users;
}

// Changes a staff user's privilege tier by adding/removing the Admin/Staff Descope role names
// (see resolveAppRole) — USER is the absence of both, so nothing is added for it. Keyed by
// loginId, not userId: Descope's role add/remove Management API endpoints take loginId.
//
// NOTE: this project resolves roles from tenant-scoped assignments too, not just top-level
// (gh-66) — these calls only touch the top-level assignment. If an existing user's Admin/Staff
// role actually lives inside a tenant membership, this may not change what resolveAppRole reads
// for them. Verify against a real account (see tasks.md Phase 7) before relying on this for an
// already-tenant-scoped user.
export async function setUserRole(loginId: string, role: AppRole): Promise<void> {
  const removeRes = await fetch('https://api.descope.com/v1/mgmt/user/update/role/remove', {
    method: 'POST',
    headers: mgmtHeaders(),
    body: JSON.stringify({ loginId, roleNames: [ADMIN_ROLE_NAME, STAFF_ROLE_NAME] }),
  });
  if (!removeRes.ok) {
    throw new Error(`Descope role remove failed: ${removeRes.status} ${await removeRes.text()}`);
  }

  if (role === 'USER') return;

  const addRes = await fetch('https://api.descope.com/v1/mgmt/user/update/role/add', {
    method: 'POST',
    headers: mgmtHeaders(),
    body: JSON.stringify({ loginId, roleNames: [role === 'ADMIN' ? ADMIN_ROLE_NAME : STAFF_ROLE_NAME] }),
  });
  if (!addRes.ok) {
    throw new Error(`Descope role add failed: ${addRes.status} ${await addRes.text()}`);
  }
}
