import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { invalidateStadiums } from '../../../../lib/lookup-cache';

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  await prisma.stadium.delete({ where: { id: params.id } });
  invalidateStadiums();
  return NextResponse.json({ success: true });
}
