import { NextResponse } from 'next/server';
import { verifyDescopeSession, resolveAppRole } from '../../../../lib/descope';
import { createSessionCookie } from '../../../../lib/auth';
import { checkRateLimit, requestIp } from '../../../../lib/rate-limit';

const RATE_LIMIT_WINDOW_SECONDS = 600;
const RATE_LIMIT_MAX_ATTEMPTS = 20;

export async function POST(request: Request) {
  const allowed = await checkRateLimit(`session_attempts:${requestIp(request)}`, {
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    max: RATE_LIMIT_MAX_ATTEMPTS,
  });
  if (!allowed) {
    return NextResponse.json({ message: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const sessionToken = body?.sessionToken as string | undefined;

  if (!sessionToken) {
    return NextResponse.json({ message: 'sessionToken is required.' }, { status: 400 });
  }

  const descopeUser = await verifyDescopeSession(sessionToken);
  if (!descopeUser) {
    return NextResponse.json({ message: 'Invalid or expired session.' }, { status: 401 });
  }

  const role = resolveAppRole(descopeUser.roles);
  if (!role) {
    return NextResponse.json({ message: 'Your account does not have access to this app.' }, { status: 403 });
  }

  const user = {
    id: descopeUser.id,
    email: descopeUser.email,
    name: descopeUser.name,
    role,
  };

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: 'dam_session',
    value: createSessionCookie(user),
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90,
  });

  return response;
}
