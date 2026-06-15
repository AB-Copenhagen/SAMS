import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const sponsor = await prisma.sponsor.update({
    where: { id: params.id },
    data: { name: body.name, logoUrl: body.logoUrl ?? null, tier: body.tier ?? null, active: body.active ?? true },
  });
  return NextResponse.json(sponsor);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  await prisma.sponsor.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
