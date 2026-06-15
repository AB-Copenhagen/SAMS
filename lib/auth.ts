import { cookies } from 'next/headers';
import { verifyDescopeSession } from './descope';

export type UserRole = 'ADMIN' | 'PLAYER' | 'MEDIA' | 'SPONSOR';

export type User = {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
};

const SESSION_COOKIE_NAME = 'dam_session';

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME);

  if (!session?.value) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(session.value)) as User;
    if (parsed?.id && parsed?.email && parsed?.role) {
      return parsed;
    }
  } catch {
    // Continue to Descope session fallback
  }

  const descopeSession = await verifyDescopeSession(session.value);
  if (!descopeSession) {
    return null;
  }

  return {
    id: descopeSession.id,
    email: descopeSession.email,
    name: descopeSession.name,
    role: 'ADMIN',
  };
}

export function createSessionCookie(user: User) {
  return JSON.stringify(user);
}

export function isAdmin(user: User | null): boolean {
  return Boolean(user && user.role === 'ADMIN');
}
