import { prisma } from './db';
import type { GcvResult } from './gcv';
import { matchSponsorTokens } from './sponsor-matching';
import { upsertPlayerTag, upsertSponsorTag } from './asset-tags';

const LABEL_THRESHOLD  = 0.70;
const LOGO_THRESHOLD   = 0.60; // lower threshold — custom logos may score conservatively
const OBJECT_THRESHOLD = 0.70;

// Shot-type classification from GCV labels and objects
const SHOT_TYPE_RULES: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(kick|shot|header|tackle|save|dive|sprint|jump|celebrat)/i, tag: 'action-shot' },
  { pattern: /\b(crowd|fan|supporter|stand|tribune|cheering)/i,            tag: 'fan-shot' },
  { pattern: /\b(team.?photo|squad|group|lineup|line.?up)/i,               tag: 'team-photo' },
  { pattern: /\b(stadium|pitch|field|grass|ground|aerial)/i,               tag: 'stadium-scenery' },
  { pattern: /\b(press|interview|conference|media|journalist)/i,           tag: 'press-conference' },
  { pattern: /\b(warm.?up|training|practice|drill)/i,                      tag: 'training' },
  { pattern: /\b(trophy|medal|award|ceremony)/i,                           tag: 'ceremony' },
];

export interface GcvEnrichmentResult {
  tags:         string[];
  aiDescription: string;
  playerNames:  string[];
  sponsorNames: string[];
}

export async function enrichFromGcvResult(
  assetId: string,
  result: GcvResult,
): Promise<GcvEnrichmentResult> {
  const tags:         string[] = [];
  const playerNames:  string[] = [];
  const sponsorNames: string[] = [];

  // ── Face / people count ───────────────────────────────────────────────────
  const faceCount = result.faces.length;
  if (faceCount > 0) {
    tags.push('faces-detected');
    tags.push(`${faceCount}-${faceCount === 1 ? 'face' : 'faces'}`);
    if (faceCount === 1) tags.push('single-person');
    else if (faceCount <= 3) tags.push('small-group');
    else tags.push('large-group');
  }

  // ── Jersey number OCR → player lookup ────────────────────────────────────
  const jerseyPlayerIds = new Set<string>();
  if (result.text) {
    const numbers = result.text
      .split(/\s+/)
      .map((w) => parseInt(w.replace(/[^\d]/g, ''), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 99);

    if (numbers.length > 0) {
      const players = await prisma.player.findMany({
        where:  { number: { in: numbers }, active: true },
        select: { id: true, name: true, number: true },
      });
      for (const p of players) {
        playerNames.push(p.name);
        tags.push(`player:${p.name.toLowerCase().replace(/\s+/g, '-')}`);
        jerseyPlayerIds.add(p.id);
      }
    }
  }

  // ── Logo detection → sponsor lookup ──────────────────────────────────────
  const detectedLogos = result.logos
    .filter((l) => l.score >= LOGO_THRESHOLD)
    .map((l) => ({ name: l.description.toLowerCase(), score: l.score }));

  const confirmedSponsorIds = new Map<string, number>();
  if (detectedLogos.length > 0) {
    tags.push('logo-detected');
    const sponsors = await prisma.sponsor.findMany({
      where:  { active: true },
      select: { id: true, name: true },
    });
    for (const sponsor of sponsors) {
      const lower = sponsor.name.toLowerCase();
      const match = detectedLogos.find((d) => d.name.includes(lower) || lower.includes(d.name));
      if (match) {
        sponsorNames.push(sponsor.name);
        tags.push(`sponsor:${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`);
        confirmedSponsorIds.set(sponsor.id, match.score);
      }
    }
  }

  // ── Sponsor name/alias OCR text matching (cheap — reuses OCR already paid for) ──
  const suggestedSponsorIds = new Set<string>();
  if (result.text) {
    const activeSponsors = await prisma.sponsor.findMany({
      where: { active: true },
      select: { id: true, name: true, aliasesJson: true },
    });
    const ocrMatches = matchSponsorTokens(result.text, activeSponsors);
    for (const m of ocrMatches) {
      if (confirmedSponsorIds.has(m.sponsorId)) continue;
      if (m.isFullName) {
        confirmedSponsorIds.set(m.sponsorId, 1.0);
        const sponsor = activeSponsors.find((s) => s.id === m.sponsorId);
        if (sponsor && !sponsorNames.includes(sponsor.name)) {
          sponsorNames.push(sponsor.name);
          tags.push(`sponsor:${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`);
        }
      } else {
        suggestedSponsorIds.add(m.sponsorId);
      }
    }
  }

  // ── Shot-type classification from labels + objects ────────────────────────
  const textToScan = [
    ...result.labels.filter((l) => l.score >= LABEL_THRESHOLD).map((l) => l.description),
    ...result.objects.filter((o) => o.score >= OBJECT_THRESHOLD).map((o) => o.name),
  ].join(' ');

  for (const rule of SHOT_TYPE_RULES) {
    if (rule.pattern.test(textToScan)) tags.push(rule.tag);
  }

  // ── High-confidence label tags ────────────────────────────────────────────
  const notableLabels = result.labels
    .filter((l) => l.score >= 0.85)
    .map((l) => l.description.toLowerCase().replace(/\s+/g, '-'))
    .slice(0, 5);
  tags.push(...notableLabels);

  // ── Natural language description ──────────────────────────────────────────
  // Combine shot-type (if detected), top labels, and detected objects into a sentence.
  const shotType = SHOT_TYPE_RULES.find((r) => r.pattern.test(textToScan))?.tag;
  const topTerms = [
    ...result.labels.filter((l) => l.score >= LABEL_THRESHOLD).slice(0, 5).map((l) => l.description),
    ...result.objects.filter((o) => o.score >= OBJECT_THRESHOLD).slice(0, 3).map((o) => o.name),
  ];
  const uniqueTerms = [...new Set(topTerms)].slice(0, 7);

  let aiDescription = '';
  if (shotType) {
    const label = shotType.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    aiDescription = `${label}: ${uniqueTerms.join(', ')}.`;
  } else if (uniqueTerms.length > 0) {
    aiDescription = uniqueTerms.join(', ') + '.';
  }

  // Append player and sponsor context if detected
  if (playerNames.length > 0) {
    aiDescription += ` Players: ${playerNames.join(', ')}.`;
  }
  if (sponsorNames.length > 0) {
    aiDescription += ` Sponsors: ${sponsorNames.join(', ')}.`;
  }

  // ── Dedupe and persist ────────────────────────────────────────────────────
  const uniqueTags = [...new Set(tags)];

  await prisma.asset.update({
    where: { id: assetId },
    data: {
      detectedTagsJson: JSON.stringify(uniqueTags),
      gcvResponseJson:  JSON.stringify(result),
      aiDescription,
    },
  });

  // Structured join-table rows — the source of truth for the player/sponsor photo galleries.
  for (const playerId of jerseyPlayerIds) {
    await upsertPlayerTag(assetId, playerId, 'jersey-ocr', null, 'confirmed');
  }
  for (const [sponsorId, score] of confirmedSponsorIds) {
    await upsertSponsorTag(assetId, sponsorId, 'logo-name', score, 'confirmed');
  }
  for (const sponsorId of suggestedSponsorIds) {
    await upsertSponsorTag(assetId, sponsorId, 'ocr-text', 0.6, 'suggested');
  }

  return { tags: uniqueTags, aiDescription, playerNames, sponsorNames };
}
