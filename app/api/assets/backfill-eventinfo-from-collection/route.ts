import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { resolveEventFieldDefaults } from '../../../../lib/collections';

export const maxDuration = 60;

// One-time backfill: assigning a Collection to an asset (at ingest or via the edit form) never
// retroactively filled in that asset's own eventName/eventDate/seasonId — see
// resolveEventFieldDefaults, now applied going forward on both paths. This catches every
// already-existing asset stuck with a collection but blank event info.
const CANDIDATES_WHERE: Prisma.AssetWhereInput = {
  collectionId: { not: null },
  OR: [{ eventName: null }, { eventName: '' }, { eventDate: null }, { seasonId: null }, { seasonId: '' }],
};

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const count = await prisma.asset.count({ where: CANDIDATES_WHERE });
  return NextResponse.json({ candidateCount: count });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const candidates = await prisma.asset.findMany({
    where: CANDIDATES_WHERE,
    select: { id: true, eventName: true, eventDate: true, seasonId: true, collectionId: true },
  });

  let updated = 0;
  let skippedNoCollection = 0;
  for (const a of candidates) {
    const resolved = await resolveEventFieldDefaults(a.collectionId, {
      eventName: a.eventName,
      eventDate: a.eventDate,
      seasonId: a.seasonId,
    });

    const data: Record<string, unknown> = {};
    if (resolved.eventName && resolved.eventName !== a.eventName) data.eventName = resolved.eventName;
    if (resolved.eventDate && (!a.eventDate || resolved.eventDate.getTime() !== a.eventDate.getTime())) data.eventDate = resolved.eventDate;
    if (resolved.seasonId && resolved.seasonId !== a.seasonId) data.seasonId = resolved.seasonId;

    if (Object.keys(data).length === 0) {
      skippedNoCollection++;
      continue;
    }

    await prisma.asset.update({ where: { id: a.id }, data });
    updated++;
  }

  return NextResponse.json({ scanned: candidates.length, updated, skippedNoCollection });
}
