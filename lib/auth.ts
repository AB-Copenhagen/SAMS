import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'crypto';
import { verifyDescopeSession } from './descope';
import { findStaffUserByEmail, resolveLoginDecision } from './staff-users';

export type UserRole = 'ADMIN' | 'STAFF' | 'USER' | 'PLAYER' | 'MEDIA' | 'SPONSOR';

export type User = {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
};

export type Module = 'media' | 'crm' | 'adminSettings';
export type PermissionAction = 'view' | 'add' | 'edit' | 'delete';

// Per-role module access (gh-72) — fixed per role tier, no per-user overrides. PLAYER/MEDIA/
// SPONSOR aren't login roles (see isStaffOrAdmin below) so they carry no module permissions.
const PERMISSION_MATRIX: Record<Module, Record<UserRole, PermissionAction[]>> = {
  media: {
    USER: ['view', 'add', 'edit'],
    STAFF: ['view', 'add', 'edit', 'delete'],
    ADMIN: ['view', 'add', 'edit', 'delete'],
    PLAYER: [],
    MEDIA: [],
    SPONSOR: [],
  },
  crm: {
    USER: [],
    STAFF: ['view'],
    ADMIN: ['view', 'edit', 'delete'],
    PLAYER: [],
    MEDIA: [],
    SPONSOR: [],
  },
  adminSettings: {
    USER: [],
    STAFF: [],
    ADMIN: ['view', 'edit'],
    PLAYER: [],
    MEDIA: [],
    SPONSOR: [],
  },
};

export function hasPermission(user: User | null, module: Module, action: PermissionAction): boolean {
  return Boolean(user && PERMISSION_MATRIX[module][user.role].includes(action));
}

const SESSION_COOKIE_NAME = 'dam_session';

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

export function createSessionCookie(user: User): string {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function parseSessionCookie(value: string): User | null {
  const dot = value.lastIndexOf('.');
  if (dot === -1) return null;

  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);

  const expected = createHmac('sha256', getSecret()).update(payload).digest('base64url');

  try {
    if (!timingSafeEqual(Buffer.from(sig, 'ascii'), Buffer.from(expected, 'ascii'))) return null;
  } catch {
    return null;
  }

  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString()) as User;
    if (user?.id && user?.email && user?.role) return user;
  } catch {
    return null;
  }

  return null;
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME);

  if (!session?.value) return null;

  const parsed = parseSessionCookie(session.value);
  if (parsed) return parsed;

  // Fallback: raw Descope session token (covers legacy cookies and direct API calls). Must apply
  // the same StaffUser roster check as app/api/auth/session/route.ts (gh-76) -- this path bypasses
  // that route entirely, so a suspended or never-invited user must not get in through it either.
  const descopeSession = await verifyDescopeSession(session.value);
  if (!descopeSession) return null;

  const decision = resolveLoginDecision(await findStaffUserByEmail(descopeSession.email));
  if (!decision.allowed || !decision.role) return null;

  return {
    id: descopeSession.id,
    email: descopeSession.email,
    name: descopeSession.name,
    role: decision.role,
  };
}

export function isAdmin(user: User | null): user is User {
  return Boolean(user && user.role === 'ADMIN');
}

// isAdmin/isStaffOrAdmin are role checks, not module permission checks — use hasPermission/
// requirePermission (above) for anything gated by Media Assets/CRM/Admin Settings access.
// These two remain for the few non-module gates this app still has: app/api/system/*'s one-shot
// admin maintenance routes (gh-72 spec Question 4 — intentionally kept isAdmin-only, outside the
// module RBAC) and any plain "staff or better" check with no module behind it. PLAYER/MEDIA/
// SPONSOR sessions come from a separate device-key auth path (app/api/devices/route.ts) and must
// not gain access just by having *a* session cookie, hence the explicit role check rather than
// "any logged-in user."
export function isStaffOrAdmin(user: User | null): user is User {
  return Boolean(user && (user.role === 'ADMIN' || user.role === 'STAFF'));
}

/**
 * Call at the top of an ADMIN-only server component page. Sends a request with no session at
 * all to /login, and a logged-in request that just lacks the role to /home — centralized so
 * every admin-only route redirects a logged-in non-admin the same way instead of some bouncing
 * to /login and others to /home. `redirect()` never returns, so this narrows `user` for the
 * rest of the caller.
 */
export function requireAdmin(user: User | null): User {
  if (!user) redirect('/login');
  if (!isAdmin(user)) redirect('/home');
  return user;
}

/** Same as requireAdmin, but for a STAFF-or-ADMIN-only page — see isStaffOrAdmin. */
export function requireStaff(user: User | null): User {
  if (!user) redirect('/login');
  if (!isStaffOrAdmin(user)) redirect('/home');
  return user;
}

/** Same as requireAdmin, but for a page gated by module permission — see hasPermission. */
export function requirePermission(user: User | null, module: Module, action: PermissionAction): User {
  if (!user) redirect('/login');
  if (!hasPermission(user, module, action)) redirect('/home');
  return user;
}
