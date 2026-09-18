import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getCachedCollections, invalidateCollections } from '../../../lib/lookup-cache';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const collections = await getCachedCollections();
  return NextResponse.json(collections);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const collection = await prisma.collection.create({
    data: {
      name: body.name,
      type: body.type ?? 'game',
      date: body.date ? new Date(body.date) : null,
      opponent: body.opponent ?? null,
      venue: body.venue ?? null,
      seasonId: body.seasonId || null,
      stadiumId: body.stadiumId || null,
    },
  });
  invalidateCollections();
  return NextResponse.json(collection);
}
