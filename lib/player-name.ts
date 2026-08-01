// A handful of stored Player rows predate app/api/players/import/route.ts's entity decoding (or
// were entered by hand with raw markup pasted in) and still have literal "&#039;"/"&amp;"-style
// text baked into `name` — e.g. "O&#039;Vonte Mullings" instead of "O'Vonte Mullings". Decoding
// those here means normalizePlayerName still treats them as the same name, even though the digits
// inside a numeric entity would otherwise survive the punctuation strip below and produce a
// different key ("o039vonte..." vs. "ovonte...").
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&');
}

// Collapses any punctuation difference (straight vs. curly apostrophe, stray hyphens, an
// undecoded HTML entity, etc.) so a name matches itself regardless of how a given source encoded
// it — ab.dk's CMS in particular isn't consistent about this across scrapes. Letters/digits/
// whitespace only, case-insensitive.
export function normalizePlayerName(name: string): string {
  return decodeHtmlEntities(name)
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
