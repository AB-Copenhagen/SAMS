import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { matchCollectionByCaptureDate, resolveEventFieldDefaults } from '../../../../lib/collections';

export const maxDuration = 60;

// One-time backfill: assets already uploaded with no collection assigned (mobile ingest has no
// collection picker at all; bulk upload leaves it to whoever's uploading) never get matched to a
// match/season after the fact. Same EXIF-capture-date fallback now applied at ingest time for
// future uploads (matchCollectionByCaptureDate) — this catches the existing backlog.
const UNASSIGNED_WHERE: Prisma.AssetWhereInput = { collectionId: null, exifJson: { not: null } };

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const count = await prisma.asset.count({ where: UNASSIGNED_WHERE });
  return NextResponse.json({ candidateCount: count });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const candidates = await prisma.asset.findMany({
    where: UNASSIGNED_WHERE,
    select: { id: true, exifJson: true, eventName: true, eventDate: true, seasonId: true },
  });

  let matched = 0;
  let unmatched = 0;
  for (const a of candidates) {
    const match = await matchCollectionByCaptureDate(a.exifJson);
    if (!match) { unmatched++; continue; }

    const resolved = await resolveEventFieldDefaults(match.collectionId, {
      eventName: a.eventName,
      eventDate: a.eventDate,
      seasonId: a.seasonId,
    });

    await prisma.asset.update({
      where: { id: a.id },
      data: {
        collectionId: match.collectionId,
        eventName: resolved.eventName,
        eventDate: resolved.eventDate,
        seasonId: resolved.seasonId,
      },
    });
    matched++;
  }

  return NextResponse.json({ scanned: candidates.length, matched, unmatched });
}
