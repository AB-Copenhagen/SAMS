import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import type { ParsedMatch } from '../../../../lib/sofascore-import';

// GET — return existing game-collection keys so client can mark duplicates
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.collection.findMany({
    where: { type: 'game' },
    select: { name: true, date: true },
  });

  const keys = existing.map((c) => `${c.name}|${c.date?.toISOString().split('T')[0] ?? ''}`);
  return NextResponse.json({ keys });
}

// POST — client sends parsed matches; server deduplicates and saves
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

  return NextResponse.json({ created, skipped });
}
