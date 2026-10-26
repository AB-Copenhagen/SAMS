import { NextResponse } from 'next/server';
import { getCurrentUser, createSessionCookie } from '../../../../lib/auth';
import { setStaffUserName } from '../../../../lib/staff-users';

const MAX_NAME_LENGTH = 120;

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ message: 'Name is required' }, { status: 400 });
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ message: `Name must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 });
  }

  await setStaffUserName(user.email, name);

  // The session cookie (not a DB read) is what getCurrentUser()/TopHeader render from, so it has
  // to be reissued with the new name here, or the old name would keep showing for up to 24h.
  const response = NextResponse.json({ ok: true, name });
  response.cookies.set({
    name: 'dam_session',
    value: createSessionCookie({ ...user, name }),
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
  });
  return response;
}
