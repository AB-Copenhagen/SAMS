const MIN_ALIAS_LENGTH = 3;

export interface SponsorForMatching {
  id: string;
  name: string;
  aliasesJson: string | null;
}

export interface SponsorTokenMatch {
  sponsorId: string;
  matchedToken: string;
  isFullName: boolean;
}

// Case-insensitive substring match of OCR text against each sponsor's registered name and
// admin-curated aliases (e.g. "XYZ" for "XYZ Byggefirma A/S" — aliases are curated, not derived
// automatically from the name, since auto-stripping suffixes like "A/S" produces unpredictable
// short-string collisions). Full-name matches are treated as high-confidence ("confirmed" parity
// with existing logo-name detection); alias-only matches are lower-confidence ("suggested").
export function matchSponsorTokens(text: string, sponsors: SponsorForMatching[]): SponsorTokenMatch[] {
  const haystack = text.toLowerCase();
  if (!haystack.trim()) return [];

  const matches: SponsorTokenMatch[] = [];

  for (const sponsor of sponsors) {
    const name = sponsor.name.toLowerCase();
    if (name.length >= MIN_ALIAS_LENGTH && haystack.includes(name)) {
      matches.push({ sponsorId: sponsor.id, matchedToken: sponsor.name, isFullName: true });
      continue;
    }

    const aliases: string[] = sponsor.aliasesJson ? JSON.parse(sponsor.aliasesJson) : [];
    for (const alias of aliases) {
      const lower = alias.toLowerCase().trim();
      if (lower.length >= MIN_ALIAS_LENGTH && haystack.includes(lower)) {
        matches.push({ sponsorId: sponsor.id, matchedToken: alias, isFullName: false });
        break;
      }
    }
  }

  return matches;
}
