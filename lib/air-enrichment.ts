import { prisma } from './db';
import type { AirResult } from './air';

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
  if (result.logos && result.logos.length > 0) {
    const detected = result.logos
      .filter((l) => l.confidence >= CONFIDENCE_THRESHOLD)
      .map((l) => l.name.toLowerCase());

    if (detected.length > 0) {
      const sponsors = await prisma.sponsor.findMany({ select: { name: true }, where: { active: true } });
      for (const sponsor of sponsors) {
        const lower = sponsor.name.toLowerCase();
        if (detected.some((d) => d.includes(lower) || lower.includes(d))) {
          sponsorNames.push(sponsor.name);
          tags.push(`sponsor:${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`);
        }
      }
      tags.push('logo-detected');
    }
  }

  // --- Object detection → jersey numbers → cross-reference player roster ---
  if (result.text && result.text.length > 0) {
    const numbers = result.text
      .map((t) => parseInt(t.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 99);

    if (numbers.length > 0) {
      const players = await prisma.player.findMany({
        where: { number: { in: numbers }, active: true },
        select: { name: true, number: true },
      });
      for (const p of players) {
        playerNames.push(p.name);
        tags.push(`player:${p.name.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }
  }

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

  return {
    tags: uniqueTags,
    description: result.description ?? '',
    playerNames,
    sponsorNames,
  };
}
