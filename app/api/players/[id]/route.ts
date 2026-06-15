import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const player = await prisma.player.update({
    where: { id: params.id },
    data: {
      name:        body.name,
      number:      body.number ? Number(body.number) : null,
      position:    body.position  || null,
      headshotUrl: body.headshotUrl || null,
      team:        body.team        || null,
      seasonId:    body.seasonId    || null,
      active:      body.active ?? true,
    },
    include: { season: { select: { id: true, name: true } } },
  });
  return NextResponse.json(player);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  await prisma.player.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
