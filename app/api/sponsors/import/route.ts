import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { uploadFileToWasabi } from '../../../../lib/wasabi';

const TIER_MAP: Record<string, string> = {
  'HOVEDSPONSOR':  'title',
  'AB PARTNER':    'gold',
  'PARTNER':       'gold',
  'SØLVPARTNER':   'silver',
  'BRONZEPARTNER': 'bronze',
};

type ParsedSponsor = { name: string; sourceImageUrl: string | null; tier: string | null };

function parseSponsors(html: string): ParsedSponsor[] {
  const results: ParsedSponsor[] = [];
  const sections = html.split(/<h2[^>]*>/i).slice(1);

  for (const section of sections) {
    const h2End = section.indexOf('</h2>');
    if (h2End === -1) continue;

    const tierRaw = section.slice(0, h2End).replace(/<[^>]+>/g, '').trim();
    const tier = TIER_MAP[tierRaw] ?? tierRaw.toLowerCase() ?? null;
    const body = section.slice(h2End + 5);

    const imgRx = /<img[^>]+src="([^"]+)"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRx.exec(body)) !== null) {
      const after = body.slice(m.index + m[0].length, m.index + m[0].length + 500);
      const h3 = after.match(/<h3[^>]*>([^<]+)<\/h3>/i);
      if (!h3) continue;

      const rawSrc = m[1].replace(/&#0*38;/g, '&').replace(/&amp;/g, '&');
      const sourceImageUrl = rawSrc.split('?')[0] + '?resize=300,150&ssl=1';

      results.push({ name: h3[1].trim(), sourceImageUrl, tier });
    }
  }

  return results;
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
    const contentType = res.headers.get('content-type') ?? 'image/png';
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
    const res = await fetch('https://ab.dk/sponsorer/', {
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

  const parsed = parseSponsors(html);
  if (parsed.length === 0) {
    return NextResponse.json({ message: 'No sponsors found — page structure may have changed' }, { status: 422 });
  }

  // Download and upload all logos to Wasabi in parallel
  const withImages = await Promise.all(
    parsed.map(async (s) => {
      const objectKey = s.sourceImageUrl
        ? await fetchAndUpload(s.sourceImageUrl, `sponsors/${nameToSlug(s.name)}.jpg`)
        : null;
      return { ...s, logoObjectKey: objectKey };
    })
  );

  const existing = await prisma.sponsor.findMany({ select: { id: true, name: true } });
  const byName = new Map(existing.map((s) => [s.name, s.id]));

  let created = 0, updated = 0;
  for (const s of withImages) {
    const existingId = byName.get(s.name);
    if (existingId) {
      await prisma.sponsor.update({
        where: { id: existingId },
        data: { logoUrl: s.logoObjectKey ?? undefined, tier: s.tier, active: true },
      });
      updated++;
    } else {
      await prisma.sponsor.create({
        data: { name: s.name, logoUrl: s.logoObjectKey ?? null, tier: s.tier, active: true },
      });
      created++;
    }
  }

  return NextResponse.json({ success: true, total: parsed.length, created, updated });
}
