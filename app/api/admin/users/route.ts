import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../../lib/auth';
import { listStaffUsers } from '../../../../lib/descope';

export async function GET() {
  const user = await getCurrentUser();
  if (!hasPermission(user, 'adminSettings', 'view')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const users = await listStaffUsers();
  return NextResponse.json({ users });
}
