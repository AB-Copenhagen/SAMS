import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { uploadFileToWasabi } from '../../../../lib/wasabi';

const POSITION_MAP: Record<string, string> = {
  'Målmand':  'Goalkeeper',
  'Forsvar':  'Defender',
  'Midtbane': 'Midfielder',
  'Angreb':   'Forward',
};

type ParsedPlayer = {
  name: string;
  number: number | null;
  position: string | null;
  sourceImageUrl: string | null;
};

function parsePlayers(html: string): ParsedPlayer[] {
  const cards = html.split('<div class="trupen-card">').slice(1);

  return cards.flatMap((card) => {
    const name   = card.match(/<div class="trupen-card-name">\s*([^<]+?)\s*<\/div>/)?.[1]?.trim();
    const numStr = card.match(/<div class="trupen-card-number">\s*(\d+)\s*<\/div>/)?.[1];
    const role   = card.match(/<div class="trupen-card-role">\s*([^<]+?)\s*<\/div>/)?.[1]?.trim();
    const rawSrc = card.match(/<div class="trupen-card-photo">[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1];

    if (!name) return [];

    let sourceImageUrl: string | null = null;
    if (rawSrc) {
      const decoded = rawSrc.replace(/&#0*38;/g, '&').replace(/&amp;/g, '&');
      sourceImageUrl = decoded.split('?')[0] + '?resize=320,480&ssl=1';
    }

    return [{ name, number: numStr ? parseInt(numStr, 10) : null, position: role ? (POSITION_MAP[role] ?? role) : null, sourceImageUrl }];
  });
}

function nameToSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchAndUpload(sourceUrl: string, objectKey: string): Promise<string | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AB-DAM/1.0)' }, signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    await uploadFileToWasabi(objectKey, buffer, contentType);
    return objectKey;
  } catch {
    clearTimeout(t);
    return null;
  }
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let html: string;
  try {
    const res = await fetch('https://ab.dk/truppen/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AB-DAM/1.0)' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return NextResponse.json({ message: `ab.dk returned ${res.status}` }, { status: 502 });
    html = await res.text();
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: 'Failed to fetch ab.dk: ' + msg }, { status: 502 });
  }

  const parsed = parsePlayers(html);
  if (parsed.length === 0) {
    return NextResponse.json({ message: 'No players found — page structure may have changed' }, { status: 422 });
  }

  // Download and upload all headshots to Wasabi in parallel
  const withImages = await Promise.all(
    parsed.map(async (p) => {
      const objectKey = p.sourceImageUrl
        ? await fetchAndUpload(p.sourceImageUrl, `players/${nameToSlug(p.name)}.jpg`)
        : null;
      return { ...p, headshotObjectKey: objectKey };
    })
  );

  const existing = await prisma.player.findMany({ select: { id: true, name: true } });
  const byName = new Map(existing.map((p) => [p.name, p.id]));

  let created = 0, updated = 0;
  for (const p of withImages) {
    const existingId = byName.get(p.name);
    if (existingId) {
      await prisma.player.update({
        where: { id: existingId },
        data: {
          number:      p.number,
          position:    p.position,
          headshotUrl: p.headshotObjectKey ?? undefined,
          active:      true,
        },
      });
      updated++;
    } else {
      await prisma.player.create({
        data: {
          name:        p.name,
          number:      p.number,
          position:    p.position,
          headshotUrl: p.headshotObjectKey ?? null,
          active:      true,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ success: true, total: parsed.length, created, updated });
}
