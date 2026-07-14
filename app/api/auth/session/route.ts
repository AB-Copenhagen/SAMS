import { NextResponse } from 'next/server';
import { verifyDescopeSession } from '../../../../lib/descope';
import { createSessionCookie, isAdminEmail } from '../../../../lib/auth';
import type { UserRole } from '../../../../lib/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sessionToken = body?.sessionToken as string | undefined;

  if (!sessionToken) {
    return NextResponse.json({ message: 'sessionToken is required.' }, { status: 400 });
  }

  const descopeUser = await verifyDescopeSession(sessionToken);
  if (!descopeUser) {
    return NextResponse.json({ message: 'Invalid or expired session.' }, { status: 401 });
  }

  if (!isAdminEmail(descopeUser.email)) {
    return NextResponse.json({ message: 'Your account does not have access to this app.' }, { status: 403 });
  }

  const role: UserRole = 'ADMIN';
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
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
