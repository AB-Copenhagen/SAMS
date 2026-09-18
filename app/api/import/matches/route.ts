import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { fetchSeasonFixtures } from '../../../../lib/api-football';
import type { ParsedMatch } from '../../../../lib/api-football';
import { invalidateCollections } from '../../../../lib/lookup-cache';

// GET — fetch fixtures from api-football server-side + existing keys for dedup
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get('season') ?? '2024', 10);

  let fixtures: ParsedMatch[] = [];
  let apiError: string | null = null;

  try {
    fixtures = await fetchSeasonFixtures(season);
  } catch (e) {
    apiError = e instanceof Error ? e.message : 'Failed to fetch fixtures';
  }

  const existing = await prisma.collection.findMany({
    where: { type: 'game' },
    select: { name: true, date: true },
  });
  const existingKeys = new Set(
    existing.map((c) => `${c.name}|${c.date?.toISOString().split('T')[0] ?? ''}`),
  );

  return NextResponse.json({ fixtures, existingKeys: [...existingKeys], apiError });
}

// POST — save selected matches to the DB
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const body = await request.json() as { matches: ParsedMatch[]; seasonId: string };
  if (!body.seasonId) return NextResponse.json({ message: 'seasonId required' }, { status: 400 });
  if (!Array.isArray(body.matches)) return NextResponse.json({ message: 'matches array required' }, { status: 400 });

  let created = 0;
  let skipped = 0;

  for (const m of body.matches) {
    const exists = await prisma.collection.findFirst({
      where: { name: m.name, date: new Date(m.date) },
    });
    if (exists) { skipped++; continue; }

    await prisma.collection.create({
      data: {
        name:     m.name,
        type:     'game',
        date:     new Date(m.date),
        opponent: m.opponent,
        seasonId: body.seasonId,
      },
    });
    created++;
  }

  if (created > 0) invalidateCollections();

  return NextResponse.json({ created, skipped });
}
