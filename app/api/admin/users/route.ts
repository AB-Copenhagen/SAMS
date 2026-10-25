import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../../lib/auth';
import { listStaffUsers, inviteStaffUser } from '../../../../lib/staff-users';
import type { AppRole } from '../../../../lib/descope';

const VALID_ROLES: AppRole[] = ['ADMIN', 'STAFF', 'USER'];

type InviteBody = {
  email?: string;
  role?: string;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!hasPermission(user, 'adminSettings', 'view')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const users = await listStaffUsers();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, 'adminSettings', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as InviteBody;
  const email = body.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ message: 'email is required' }, { status: 400 });
  if (!body.role || !VALID_ROLES.includes(body.role as AppRole)) {
    return NextResponse.json({ message: `role must be one of ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  try {
    const invited = await inviteStaffUser(email, body.role as AppRole, user.email);
    return NextResponse.json({ user: invited }, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'That email is already on the roster.' }, { status: 409 });
  }
}
