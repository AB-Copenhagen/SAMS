import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../../../../lib/auth';
import { setUserRole, type AppRole } from '../../../../../../lib/descope';

const VALID_ROLES: AppRole[] = ['ADMIN', 'STAFF', 'USER'];

type RolePatchBody = {
  loginId?: string;
  role?: string;
};

export async function PATCH(request: Request, _props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!hasPermission(user, 'adminSettings', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as RolePatchBody;
  if (!body.loginId) return NextResponse.json({ message: 'loginId is required' }, { status: 400 });
  if (!body.role || !VALID_ROLES.includes(body.role as AppRole)) {
    return NextResponse.json({ message: `role must be one of ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  await setUserRole(body.loginId, body.role as AppRole);
  return NextResponse.json({ success: true });
}
