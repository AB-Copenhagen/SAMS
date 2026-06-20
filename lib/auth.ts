import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { verifyDescopeSession } from './descope';

export type UserRole = 'ADMIN' | 'PLAYER' | 'MEDIA' | 'SPONSOR';

export type User = {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
};

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
  const cookieStore = cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME);

  if (!session?.value) return null;

  const parsed = parseSessionCookie(session.value);
  if (parsed) return parsed;

  // Fallback: raw Descope session token (covers legacy cookies and direct API calls)
  const descopeSession = await verifyDescopeSession(session.value);
  if (!descopeSession) return null;

  return {
    id: descopeSession.id,
    email: descopeSession.email,
    name: descopeSession.name,
    role: 'ADMIN',
  };
}

export function isAdmin(user: User | null): boolean {
  return Boolean(user && user.role === 'ADMIN');
}
