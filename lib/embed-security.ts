// Defense-in-depth for gh-123's embed-scoped asset proxy routes (download/preview/thumbnail/hls)
// — NOT the primary access control. The primary control is the CSP `frame-ancestors` header on
// `/embed/[token]` itself (next.config.js), which stops *framing* the embed page from an
// unapproved domain. But `frame-ancestors` only restricts framing an HTML document — it does
// nothing to stop someone taking a proxy URL straight out of network tooling and hotlinking it
// directly (`<img src="https://media.ab.dk/api/embed/TOKEN/assets/ID/preview">`) on any page,
// entirely bypassing the iframe. This check catches that: it only allows a request that looks
// like it came from our own `/embed/[token]` page loading its own media, not from some other
// page's markup referencing the same URL directly.
function appOrigin(): string | null {
  const base = (process.env.PUBLIC_SHARE_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
  return base || null;
}

export function isSameOriginEmbedRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const self = appOrigin();

  // Neither header, or no configured base URL to compare against: can't make a reliable call
  // either way, so fail open rather than break legitimate same-origin media loads (this is a
  // supplementary check, not the access gate itself — the EmbedToken resolution already is).
  if ((!origin && !referer) || !self) return true;

  if (origin) return origin === self;
  return referer === self || referer!.startsWith(`${self}/`);
}
