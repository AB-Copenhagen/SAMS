import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// Polled by the Jobs page every 60s per open tab; the cron itself only runs every 15 minutes
// (vercel.json), so a short cache here just coalesces concurrent polls rather than hiding anything.
const getCachedCronRuns = unstable_cache(
  (limit: number) => prisma.cronRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit }),
  ['cron-runs'],
  { revalidate: 10 },
);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 20, 100);

  return NextResponse.json(await getCachedCronRuns(limit));
}
