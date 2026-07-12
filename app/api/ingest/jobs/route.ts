import { NextResponse } from 'next/server';
import { getIngestActor } from '../../../../lib/device-auth';
import { prisma } from '../../../../lib/db';

// Polling endpoint backing the "Live Ingest" panel — short-interval (2-3s) polling by design,
// not SSE/WebSockets (see plan: avoids holding a serverless function instance open for
// potentially hours-long HDD imports).
export async function GET(request: Request) {
  const actor = await getIngestActor(request);
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');
  const deviceId = searchParams.get('deviceId');

  const jobs = await prisma.ingestJob.findMany({
    where: {
      ...(actor.role === 'ADMIN' ? {} : { uploaderEmail: actor.email }),
      ...(deviceId ? { deviceId } : {}),
      ...(since ? { updatedAt: { gt: new Date(since) } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { device: { select: { name: true } } },
  });

  return NextResponse.json({ jobs, serverTime: new Date().toISOString() });
}
