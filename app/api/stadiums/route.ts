import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const stadiums = await prisma.stadium.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(stadiums);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const stadium = await prisma.stadium.create({
    data: { name: body.name, city: body.city ?? null },
  });
  return NextResponse.json(stadium);
}
