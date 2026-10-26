import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../../../lib/auth';
import { setStaffUserRole, setStaffUserStatus, type StaffUserStatus } from '../../../../../lib/staff-users';
import type { AppRole } from '../../../../../lib/descope';

const VALID_ROLES: AppRole[] = ['ADMIN', 'STAFF', 'USER'];
const VALID_STATUSES: StaffUserStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED'];

type PatchBody = {
  role?: string;
  status?: string;
};

// `id` is the StaffUser's email (gh-76) -- this used to be a Descope userId/loginId pair before
// the roster replaced Descope's Management API as the source of truth for this page.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!hasPermission(user, 'adminSettings', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { id } = await props.params;
  const email = decodeURIComponent(id);
  const body = await request.json() as PatchBody;

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role as AppRole)) {
      return NextResponse.json({ message: `role must be one of ${VALID_ROLES.join(', ')}` }, { status: 400 });
    }
    await setStaffUserRole(email, body.role as AppRole);
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as StaffUserStatus)) {
      return NextResponse.json({ message: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }
    await setStaffUserStatus(email, body.status as StaffUserStatus);
  }

  return NextResponse.json({ success: true });
}
