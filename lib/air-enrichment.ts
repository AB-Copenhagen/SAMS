import { prisma } from './db';
import type { AirResult } from './air';
import { matchSponsorTokens } from './sponsor-matching';
import { upsertPlayerTag, upsertSponsorTag } from './asset-tags';

const CONFIDENCE_THRESHOLD = 0.70;

// Shot-type keywords from AiR object/scene descriptions → tag vocabulary
const SHOT_TYPE_RULES: Array<{ patterns: RegExp; tag: string }> = [
  { patterns: /\b(kick|shot|header|tackle|save|dive|sprint|jump|celebrat)/i,  tag: 'action-shot' },
  { patterns: /\b(crowd|fan|supporter|stand|tribune|cheering)/i,              tag: 'fan-shot' },
  { patterns: /\b(team.?photo|squad|group|lineup|line.?up)/i,                 tag: 'team-photo' },
  { patterns: /\b(stadium|pitch|field|grass|ground|aerial)/i,                 tag: 'stadium-scenery' },
  { patterns: /\b(press|interview|conference|media|journalist)/i,             tag: 'press-conference' },
  { patterns: /\b(warm.?up|training|practice|drill)/i,                        tag: 'training' },
  { patterns: /\b(trophy|medal|award|ceremony)/i,                             tag: 'ceremony' },
];

export interface EnrichmentResult {
  tags: string[];
  description: string;
  playerNames: string[];
  sponsorNames: string[];
}

export async function enrichFromAirResult(
  assetId: string,
  result: AirResult,
): Promise<EnrichmentResult> {
  const tags: string[] = [];
  const playerNames: string[] = [];
  const sponsorNames: string[] = [];

  // --- Person count tag ---
  if (result.persons && result.persons.length > 0) {
    const total = result.persons.reduce((sum, p) => sum + (p.count ?? 1), 0);
    if (total === 1) tags.push('single-person');
    else if (total <= 3) tags.push('small-group');
    else tags.push('large-group');
  }

  // --- Detected faces → cross-reference player roster ---
  if (result.faces && result.faces.length > 0) {
    tags.push('faces-detected');
    // Face count tag
    const count = result.faces.length;
    if (count >= 1) tags.push(`${count}-${count === 1 ? 'face' : 'faces'}`);
  }

  // --- Logo detection → match against Sponsor table ---
  const confirmedSponsorIds = new Set<string>();
  const sponsorLogoConfidence = new Map<string, number>();
  if (result.logos && result.logos.length > 0) {
    const detected = result.logos
      .filter((l) => l.confidence >= CONFIDENCE_THRESHOLD)
      .map((l) => ({ name: l.name.toLowerCase(), confidence: l.confidence }));

    if (detected.length > 0) {
      const sponsors = await prisma.sponsor.findMany({ select: { id: true, name: true }, where: { active: true } });
      for (const sponsor of sponsors) {
        const lower = sponsor.name.toLowerCase();
        const match = detected.find((d) => d.name.includes(lower) || lower.includes(d.name));
        if (match) {
          sponsorNames.push(sponsor.name);
          tags.push(`sponsor:${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`);
          confirmedSponsorIds.add(sponsor.id);
          sponsorLogoConfidence.set(sponsor.id, match.confidence);
        }
      }
      tags.push('logo-detected');
    }
  }

  // --- Sponsor name/alias OCR text matching (cheap — reuses OCR already paid for) ---
  const suggestedSponsorIds = new Set<string>();
  if (result.text && result.text.length > 0) {
    const activeSponsors = await prisma.sponsor.findMany({
      where: { active: true },
      select: { id: true, name: true, aliasesJson: true },
    });
    const ocrMatches = matchSponsorTokens(result.text.join(' '), activeSponsors);
    for (const m of ocrMatches) {
      if (confirmedSponsorIds.has(m.sponsorId)) continue; // already confirmed via logo detection
      if (m.isFullName) {
        confirmedSponsorIds.add(m.sponsorId);
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

  // Jersey-number-based player identification now runs entirely through AWS Rekognition's
  // DetectText (lib/rekognition.ts, identifyPlayersInImage) — spatially correlated to a detected
  // person rather than a blind "any digit 1-99 anywhere in the image" match. See tag-faces route
  // and the cron's face-search loop, which call it alongside face search.

  // --- Shot-type classification from description + objects ---
  const textToScan = [
    result.description ?? '',
    ...(result.objects ?? []).filter((o) => o.confidence >= CONFIDENCE_THRESHOLD).map((o) => o.name),
  ].join(' ');

  for (const rule of SHOT_TYPE_RULES) {
    if (rule.patterns.test(textToScan)) tags.push(rule.tag);
  }

  // --- Object tags (high-confidence generic objects) ---
  if (result.objects) {
    const notable = result.objects
      .filter((o) => o.confidence >= 0.85)
      .map((o) => o.name.toLowerCase().replace(/\s+/g, '-'));
    tags.push(...notable.slice(0, 5));
  }

  // Dedupe
  const uniqueTags = [...new Set(tags)];

  // Persist to DB
  await prisma.asset.update({
    where: { id: assetId },
    data: {
      detectedTagsJson: JSON.stringify(uniqueTags),
      wasbaiResponseJson: JSON.stringify(result),
    },
  });

  // Structured join-table rows — the source of truth for the player/sponsor photo galleries.
  for (const sponsorId of confirmedSponsorIds) {
    await upsertSponsorTag(assetId, sponsorId, 'logo-name', sponsorLogoConfidence.get(sponsorId) ?? null, 'confirmed');
  }
  for (const sponsorId of suggestedSponsorIds) {
    await upsertSponsorTag(assetId, sponsorId, 'ocr-text', 0.6, 'suggested');
  }

  return {
    tags: uniqueTags,
    description: result.description ?? '',
    playerNames,
    sponsorNames,
  };
}
