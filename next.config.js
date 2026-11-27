/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app has no next/image usage — all image delivery goes through short-TTL Wasabi presigned
  // URLs instead. unoptimized disables the built-in /_next/image endpoint outright; a wildcard
  // remotePatterns hostname would otherwise make that endpoint an open, unauthenticated proxy for
  // fetching and relaying back any HTTPS URL.
  images: {
    unoptimized: true,
  },
  // Packages with a native/compiled addon must be excluded from the server bundle — bundling
  // sharp's JS wrapper breaks the relative-path lookup its native binding uses to find the
  // co-located libvips shared library at runtime (ERR_DLOPEN_FAILED on Vercel's Linux runtime).
  serverExternalPackages: ['exifr', 'sharp'],
  // gh-130: drop the framework fingerprint from every response.
  poweredByHeader: false,
  // gh-123: restrict who may frame /embed/[token] via CSP frame-ancestors — not X-Frame-Options,
  // which has no working per-domain allowlist (see that header's own docs: "superseded by CSP's
  // frame-ancestors"). This repo has no middleware.ts (security-checklist skill), so this has to
  // be static header config here, not a middleware gate. Single launch destination per spec
  // (www.ab.dk); env-var-driven so a non-production environment can allowlist a different origin
  // for testing without a code change, not because multiple destinations are supported yet — a
  // domain-management UI for more than one is explicitly out of scope for this ticket.
  //
  // gh-130: everything else gets the opposite policy — this is the staff DAM/CRM app, which has
  // no legitimate reason to ever be framed anywhere, so it gets a blanket deny plus the other
  // standard response hardening headers (nosniff, a conservative Referrer-Policy). The two
  // sources are mutually exclusive (`(?!embed)` — a path-to-regexp negative lookahead, the same
  // idiom Next's own docs use for a proxy matcher that excludes a path prefix) rather than relying
  // on Header Overriding Behavior's "last matching entry wins per key" to patch the general policy
  // back open for /embed/[token]: X-Frame-Options has no per-value override story (there's no
  // "allow this one origin" value for it), so a legacy browser that only understands
  // X-Frame-Options (and ignores the embed-specific CSP override) would otherwise still block the
  // one route that's supposed to be frameable. Excluding it from the general matcher avoids that
  // conflict outright instead of trying to out-order it.
  async headers() {
    const allowedEmbedOrigin = process.env.EMBED_ALLOWED_ORIGIN ?? 'https://www.ab.dk';
    return [
      {
        source: '/((?!embed).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/embed/:token',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${allowedEmbedOrigin}` },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
