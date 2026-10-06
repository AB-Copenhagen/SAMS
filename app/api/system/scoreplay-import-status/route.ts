import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// Progress check for the running import — counts actual Asset rows rather than tracking a
// separate progress table, since that's the thing that actually matters and needs no extra state.
//   fetch('/api/system/scoreplay-import-status').then(r => r.json()).then(console.log)
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const total = await prisma.asset.count({ where: { importSource: 'scoreplay' } });
  const byCollection = await prisma.asset.groupBy({
    by: ['collectionId'],
    where: { importSource: 'scoreplay' },
    _count: { _all: true },
  });

  const collectionIds = byCollection.map((c) => c.collectionId).filter((id): id is string => Boolean(id));
  const collections = await prisma.collection.findMany({
    where: { id: { in: collectionIds } },
    select: { id: true, name: true, type: true },
  });
  const byId = new Map(collections.map((c) => [c.id, c]));

  const perFolder = byCollection
    .map((c) => ({
      name: c.collectionId ? (byId.get(c.collectionId)?.name ?? '(unknown collection)') : '(no collection)',
      type: c.collectionId ? (byId.get(c.collectionId)?.type ?? null) : null,
      count: c._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ total, perFolder });
}
