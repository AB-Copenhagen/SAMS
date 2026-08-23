import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getCachedSponsors, invalidateSponsors } from '../../../lib/lookup-cache';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const sponsors = await getCachedSponsors();
  return NextResponse.json(sponsors);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const sponsor = await prisma.sponsor.create({
    data: {
      name: body.name,
      logoUrl: body.logoUrl ?? null,
      tier: body.tier ?? null,
      aliasesJson: Array.isArray(body.aliases) ? JSON.stringify(body.aliases) : null,
    },
  });
  invalidateSponsors();
  return NextResponse.json(sponsor);
}
