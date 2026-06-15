import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const collection = await prisma.collection.findUnique({
    where: { id: params.id },
    include: { season: true, stadium: true, assets: { orderBy: { uploadedAt: 'desc' } } },
  });
  if (!collection) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(collection);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json() as { name?: string; date?: string | null; opponent?: string | null; venue?: string | null };
  const collection = await prisma.collection.update({
    where: { id: params.id },
    data: {
      ...(body.name      !== undefined && { name: body.name }),
      ...(body.date      !== undefined && { date: body.date ? new Date(body.date) : null }),
      ...(body.opponent  !== undefined && { opponent: body.opponent || null }),
      ...(body.venue     !== undefined && { venue: body.venue || null }),
    },
  });
  return NextResponse.json(collection);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  await prisma.collection.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
