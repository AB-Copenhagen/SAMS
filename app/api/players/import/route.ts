import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { uploadFileToWasabi } from '../../../../lib/wasabi';
import { normalizePlayerName } from '../../../../lib/player-name';
import { invalidatePlayers } from '../../../../lib/lookup-cache';

const POSITION_MAP: Record<string, string> = {
  keeper:     'Goalkeeper',
  defender:   'Defender',
  midfielder: 'Midfielder',
  forward:    'Forward',
};

function decodeEntities(s: string) {
  return s
    // Straight apostrophe, in both its decimal and hex numeric-entity forms.
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    // Typographic (curly) apostrophe — ab.dk's CMS emits this for names sometimes instead of a
    // plain "'", both as a named/numeric entity and as the raw UTF-8 character. Normalizing all
    // of these down to one canonical "'" is what keeps a name matching itself across scrapes.
    .replace(/&rsquo;|&#0*8217;|&#x0*2019;/gi, "'")
    .replace(/[‘’]/g, "'")
    .replace(/&#0*38;|&amp;/gi, '&');
}

// The numeric filename in ab.dk's data-si-fallback image URL (e.g. ".../9805/1339202.png") is a
// stable per-player ID from their squad-data vendor (Sport-IT) — unlike the printed name, which
// the CMS doesn't encode consistently across scrapes. Source of truth for matching.
function extractSiPlayerId(fallbackImageUrl: string | null): string | null {
  return fallbackImageUrl?.match(/\/(\d+)\.\w+$/)?.[1] ?? null;
}

type ParsedPlayer = {
  name: string;
  number: number | null;
  position: string | null;
  sourceImageUrl: string | null;
  fallbackImageUrl: string | null;
  siPlayerId: string | null;
};

function parsePlayers(html: string): ParsedPlayer[] {
  const cards = html.split('class="squad-card').slice(1);

  return cards.flatMap((card) => {
    const dataPosition = card.match(/data-position="([^"]*)"/)?.[1];
    const nameBlock = card.match(/font-black leading-tight"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    const numStr = card.match(/font-black leading-none select-none"[^>]*>(\d+)<\/p>/)?.[1];
    const rawSrc = card.match(/<img src="([^"]+)"/)?.[1];
    const rawFallback = card.match(/data-si-fallback="([^"]+)"/)?.[1];

    if (!nameBlock) return [];
    const [firstRaw, lastRaw] = nameBlock.split(/<br\s*\/?>/);
    const first = decodeEntities((firstRaw ?? '').replace(/<[^>]+>/g, '')).trim();
    const last  = decodeEntities((lastRaw ?? '').replace(/<[^>]+>/g, '')).trim();
    const name = [first, last].filter(Boolean).join(' ');
    if (!name) return [];

    const sourceImageUrl = rawSrc ? new URL(decodeEntities(rawSrc), 'https://ab.dk').toString() : null;
    const fallbackImageUrl = rawFallback ? decodeEntities(rawFallback) : null;

    return [{
      name,
      number: numStr ? parseInt(numStr, 10) : null,
      position: dataPosition ? (POSITION_MAP[dataPosition] ?? dataPosition) : null,
      sourceImageUrl,
      fallbackImageUrl,
      siPlayerId: extractSiPlayerId(fallbackImageUrl),
    }];
  });
}

function nameToSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchAndUpload(candidateUrls: (string | null)[], objectKey: string): Promise<string | null> {
  for (const sourceUrl of candidateUrls) {
    if (!sourceUrl) continue;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10_000);
    try {
      const res = await fetch(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AB-DAM/1.0)' }, signal: ac.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      await uploadFileToWasabi(objectKey, buffer, contentType);
      return objectKey;
    } catch {
      clearTimeout(t);
    }
  }
  return null;
}

export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

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
      const objectKey = (p.sourceImageUrl || p.fallbackImageUrl)
        ? await fetchAndUpload([p.sourceImageUrl, p.fallbackImageUrl], `players/${nameToSlug(p.name)}.jpg`)
        : null;
      return { ...p, headshotObjectKey: objectKey };
    })
  );

  const existing = await prisma.player.findMany({ select: { id: true, name: true, siPlayerId: true } });
  const bySiId = new Map(existing.filter((p) => p.siPlayerId).map((p) => [p.siPlayerId!, p.id]));
  const byName = new Map(existing.map((p) => [normalizePlayerName(p.name), p.id]));

  let created = 0, updated = 0;
  for (const p of withImages) {
    // The SI ID is authoritative once a record has one — the printed name can still legitimately
    // change (spelling correction, marriage, etc.) without that meaning a new player. Only fall
    // back to name matching for records that don't have an SI ID yet, backfilling it once matched
    // so future scrapes for this player no longer depend on the name lining up at all.
    const existingId = (p.siPlayerId && bySiId.get(p.siPlayerId)) || byName.get(normalizePlayerName(p.name));
    if (existingId) {
      await prisma.player.update({
        where: { id: existingId },
        data: {
          name:        p.name,
          number:      p.number,
          position:    p.position,
          headshotUrl: p.headshotObjectKey ?? undefined,
          siPlayerId:  p.siPlayerId ?? undefined,
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
          siPlayerId:  p.siPlayerId,
          active:      true,
        },
      });
      created++;
    }
  }

  if (created > 0 || updated > 0) invalidatePlayers();
  return NextResponse.json({ success: true, total: parsed.length, created, updated });
}
