import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getCachedSeasons, invalidateSeasons } from '../../../lib/lookup-cache';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const seasons = await getCachedSeasons();
  return NextResponse.json(seasons);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const season = await prisma.season.create({
    data: { name: body.name, startDate: body.startDate ? new Date(body.startDate) : null, endDate: body.endDate ? new Date(body.endDate) : null },
  });
  invalidateSeasons();
  return NextResponse.json(season);
}
