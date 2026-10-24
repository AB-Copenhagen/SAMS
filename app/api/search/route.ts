import { NextResponse } from 'next/server';
import { getCurrentUser, isStaffOrAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getCachedPlayers, getCachedSponsors, getCachedCollections } from '../../../lib/lookup-cache';

const RESULT_LIMIT = 5;

export type SearchResult = { id: string; label: string; sublabel?: string; href: string };
export type SearchResponse = {
  assets: SearchResult[];
  players: SearchResult[];
  sponsors: SearchResult[];
  collections: SearchResult[];
  customers: SearchResult[];
};

function matches(name: string, q: string): boolean {
  return name.toLowerCase().includes(q.toLowerCase());
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json<SearchResponse>({ assets: [], players: [], sponsors: [], collections: [], customers: [] });
  }

  const [assets, allPlayers, allSponsors, allCollections] = await Promise.all([
    prisma.asset.findMany({
      where: { AND: [{ OR: [{ title: { contains: q } }, { eventName: { contains: q } }] }] },
      select: { id: true, title: true, eventName: true },
      take: RESULT_LIMIT,
      orderBy: { uploadedAt: 'desc' },
    }),
    getCachedPlayers(),
    getCachedSponsors(),
    getCachedCollections(),
  ]);

  // Customer rows must never be queried for a role that can't reach /customers — not filtered
  // out after the fact, not queried at all. STAFF can view the CRM now too (gh-64), so this
  // mirrors requireStaff on the pages themselves rather than requireAdmin. See admin-portal-ux skill.
  const customers = isStaffOrAdmin(user)
    ? await prisma.customer.findMany({
        where: { AND: [{ OR: [{ name: { contains: q } }, { email: { contains: q } }] }] },
        select: { id: true, name: true, email: true },
        take: RESULT_LIMIT,
      })
    : [];

  const response: SearchResponse = {
    assets: assets.map((a) => ({ id: a.id, label: a.title || a.eventName || 'Untitled asset', sublabel: a.eventName ?? undefined, href: `/media/${a.id}` })),
    players: allPlayers.filter((p) => matches(p.name, q)).slice(0, RESULT_LIMIT).map((p) => ({ id: p.id, label: p.name, href: `/players/${p.id}` })),
    sponsors: allSponsors.filter((s) => matches(s.name, q)).slice(0, RESULT_LIMIT).map((s) => ({ id: s.id, label: s.name, href: `/sponsors/${s.id}` })),
    collections: allCollections.filter((c) => matches(c.name, q)).slice(0, RESULT_LIMIT).map((c) => ({ id: c.id, label: c.name, sublabel: c.type, href: `/collections/${c.id}` })),
    customers: customers.map((c) => ({ id: c.id, label: c.name || c.email || c.id, sublabel: c.name ? (c.email ?? undefined) : undefined, href: `/customers/${c.id}` })),
  };

  return NextResponse.json(response);
}
