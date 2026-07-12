import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { matchSponsorTokens } from '../../../../lib/sponsor-matching';
import { upsertSponsorTag, addConfirmedStringTag } from '../../../../lib/asset-tags';

export const maxDuration = 60;

// One-time backfill: re-parses OCR text already stored in wasbaiResponseJson/gcvResponseJson
// from prior AiR/GCV analysis passes and runs the sponsor name/alias matcher against it.
// Makes ZERO new external API calls — the whole point is this is free for the historical catalog.
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const sponsors = await prisma.sponsor.findMany({
    where: { active: true },
    select: { id: true, name: true, aliasesJson: true },
  });
  if (sponsors.length === 0) return NextResponse.json({ scanned: 0, tagged: 0 });

  const assets = await prisma.asset.findMany({
    where: { OR: [{ wasbaiResponseJson: { not: null } }, { gcvResponseJson: { not: null } }] },
    select: { id: true, wasbaiResponseJson: true, gcvResponseJson: true },
  });

  let tagged = 0;
  for (const asset of assets) {
    const texts: string[] = [];
    if (asset.wasbaiResponseJson) {
      const parsed = JSON.parse(asset.wasbaiResponseJson) as { text?: string[] };
      if (Array.isArray(parsed.text)) texts.push(parsed.text.join(' '));
    }
    if (asset.gcvResponseJson) {
      const parsed = JSON.parse(asset.gcvResponseJson) as { text?: string };
      if (parsed.text) texts.push(parsed.text);
    }
    if (!texts.length) continue;

    const matches = matchSponsorTokens(texts.join(' '), sponsors);
    for (const m of matches) {
      const status = m.isFullName ? 'confirmed' : 'suggested';
      await upsertSponsorTag(asset.id, m.sponsorId, 'ocr-text', m.isFullName ? 1.0 : 0.6, status);
      if (status === 'confirmed') {
        const sponsor = sponsors.find((s) => s.id === m.sponsorId);
        if (sponsor) await addConfirmedStringTag(asset.id, `sponsor:${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`);
      }
      tagged++;
    }
  }

  return NextResponse.json({ scanned: assets.length, tagged });
}
