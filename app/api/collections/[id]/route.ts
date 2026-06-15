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

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  await prisma.collection.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
