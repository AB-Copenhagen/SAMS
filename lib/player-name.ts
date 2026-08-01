// Collapses any punctuation difference (straight vs. curly apostrophe, stray hyphens, etc.) so a
// name matches itself regardless of how a given source encoded it — ab.dk's CMS in particular
// isn't consistent about this across scrapes. Letters/digits/whitespace only, case-insensitive.
export function normalizePlayerName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
