import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 20, 100);

  const runs = await prisma.cronRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
  });

  return NextResponse.json(runs);
}
