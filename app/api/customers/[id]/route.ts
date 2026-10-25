import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!hasPermission(user, 'crm', 'view')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const params = await props.params;
  const customer = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!customer) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(customer);
}
