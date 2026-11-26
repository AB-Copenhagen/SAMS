---
ticket: gh-123
branch: feature-gh-123-support-embedding-videos-and-galleries
summary: Support embedding videos and image galleries in 3rd-party sites (ab.dk and other apps)
ticketing: github-issues
components: []
---

# Support embedding videos and image galleries in 3rd-party sites (ab.dk and other apps)

**Ticket:** [#123](https://github.com/AB-Copenhagen/SAMS/issues/123)
**Type:** feature
**Branch:** feature-gh-123-support-embedding-videos-and-galleries

---

## Context

There is no embeddable surface today. Public sharing (`/s/[token]`, collection- or asset-level, optional password gate via `lib/share-auth.ts`) renders a full staff-styled page meant for direct visits — no responsive sizing handshake, no oEmbed discovery, no frame-ancestors allowlisting. This ticket adds the ability for www.ab.dk and other apps to embed a single video, a single image, or a whole gallery/collection from this DAM.

## Scope

- Add an `/embed/[token]` route: chromeless (no staff header/nav), responsive via a `postMessage` resize handshake, with per-asset-type layout (video → player, image → `<img>`, collection → gallery grid).
- Add an `/api/oembed` endpoint resolving a share URL to that embed iframe's HTML, discoverable via `<link rel="alternate" type="application/json+oembed">` on the public share page, so pasting a share link into a CMS (e.g. ab.dk's) auto-embeds it.
- Issue embed tokens as a distinct, longer-lived, revocable variant of today's share tokens rather than silently reusing one-off share-token semantics for something meant to stay embedded indefinitely.
- Restrict framing via CSP `frame-ancestors` (not `X-Frame-Options`, which has no working per-domain allowlist), scoped to approved destination domains. This repo has **no `middleware.ts`** (see `security-checklist` skill) — the header has to come from `next.config.js`'s `headers()` config for the `/embed/:token*` path, not a global middleware gate.
- Protect Wasabi originals from hotlinking: proxy through the existing short-TTL presigned-URL pattern rather than exposing raw Wasabi URLs to the embed, with an Origin/Referer check as defense-in-depth.
- **Self-serve embed token issuance** — any staff member generates an embed link/token directly from the asset or collection UI (no admin approval step).
- **Destination allowlist at launch: `www.ab.dk` only.** The `frame-ancestors` CSP value is scoped to this one domain for now; the allowlist mechanism should be straightforward to extend later, but no UI for managing multiple domains is required yet.
- **Embed tokens are permanent until revoked** (no scheduled expiry) — matches how a YouTube/Vimeo embed behaves once published on a page. An admin (or the issuing staff member) can revoke one, which immediately 404s that embed.
- **A JS widget/player API is in scope for this ticket** (play/pause/resize beyond the `postMessage` resize handshake) — overriding the issue body's original "Out of Scope" draft, per Q&A answer. See Technical Approach for what this actually adds beyond the iframe embed.

## Out of Scope

- The first-class video player/transcoding pipeline itself (gh-122) — this ticket embeds whatever player that work already landed (`components/VideoPlayer.tsx`).
- Per-destination-domain management UI (add/remove allowed domains) — single hardcoded `www.ab.dk` allowlist entry is sufficient for this ticket; a settings UI for managing multiple domains is a follow-up if/when a second consumer shows up.

## Technical Approach

- Builds directly on the existing `/s/[token]` share-token model (`lib/collections.ts`'s `generateShareToken`/`resolveShareTarget`), reusing `resolveShareTarget`/`getPublicCollectionByToken`/`getAssetByShareToken` for target resolution so expiry/password-gate logic isn't duplicated (per the `security-checklist` skill: every public share code path must go through one of these, never a raw `prisma.*.findUnique({ where: { shareToken } })`).
- **New `EmbedToken` table**, not a new column on `Asset`/`Collection`: `Asset.shareToken`/`Collection.shareToken` are single unique columns already used for the existing direct-visit share link, and an embed is a materially different, independently-revocable grant on the same asset/collection — a row-per-embed table (`id`, `token` unique, `targetType` ('asset'|'collection'), `targetId`, `createdBy`, `createdAt`, `revokedAt` nullable) supports multiple outstanding embeds per asset and revocation without touching the existing share-link columns. Shipped via the existing one-shot-admin-route convention (`CREATE TABLE IF NOT EXISTS`, no `prisma migrate`), same as `ShareEvent` (`app/api/system/migrate-share-event`).
- A password-protected collection is not embeddable as-is (an iframe has no good UX for a password prompt mid-embed) — embed issuance should be blocked (or require removing the password first) for a `sharePasswordHash`-protected collection. Flagged here as the implementation default; revisit if that's wrong.
- `/embed/[token]` resolves `EmbedToken` (rejecting a revoked one — `revokedAt IS NOT NULL` — the same way an expired share link 404s, never a distinct "revoked" state that confirms a link once worked) to its target, then reuses the existing asset/collection rendering (`VideoPlayer`, `<img>`, `PublicAssetGallery`'s grid) stripped of `AppShell`'s staff header/nav.
- Responsive sizing: the iframe's content posts its rendered height via `postMessage` to `window.parent`; a small embedder-side snippet (documented, not shipped as an npm package) listens and resizes the `<iframe>` element. This is the same mechanism Vimeo/YouTube-style "responsive iframe" embeds use.
- **JS widget** (in scope per Q&A): a small vanilla-JS file served from this app (e.g. `/embed/player.js`) that a consuming page includes once; it finds any `<iframe data-sams-embed>` on the page, wires up the `postMessage` resize handshake automatically (no hand-rolled listener needed on the consumer side), and exposes a minimal `play()`/`pause()`/`on('resize', ...)` API over `postMessage` to the embed — player.js/Vimeo-Player-SDK-style, scoped to what's needed now (no full plugin system).
- `/api/oembed`: given a `/s/[token]` or `/s/[token]/[assetId]` URL, resolves the target the same way `/embed/[token]` does and returns oEmbed-shaped JSON (`type`, `html` — an `<iframe>` pointed at `/embed/{embedToken}`, `width`/`height` or `aspect ratio`, `title`). The public share pages (`app/s/[token]/page.tsx`, `app/s/[token]/[assetId]/page.tsx`) get a `<link rel="alternate" type="application/json+oembed" href="/api/oembed?url=...">` tag so pasting a share link into a CMS auto-discovers it — this requires minting (or looking up) an `EmbedToken` for that share target at discovery time, not requiring the share token owner to separately generate one first.
- Hotlink protection: `/embed/[token]`'s asset/image/video URLs route through the existing presigned-URL proxy pattern (same as `/api/assets/[id]/original`/`download`, and gh-122's HLS proxy routes), never a raw Wasabi URL — plus an Origin/Referer check against the domain allowlist as defense-in-depth (the CSP `frame-ancestors` header is the primary control; a browser that ignores CSP, or a direct non-iframe fetch of the proxy route, is the gap this covers).

---

## Questions

<!-- Answered via /dmx/plan Q&A — see Scope above for how each resolved. -->

1. Is embed access self-serve, or admin-gated/allowlisted per destination domain up front? **Self-serve** — any staff member generates an embed link/token from the asset or collection UI.
2. Which domains need to be allowlisted for framing at launch? **Just `www.ab.dk`.**
3. Should embed tokens be revocable/expire on a schedule, or effectively permanent once issued? **Permanent until revoked** — matches YouTube/Vimeo embed behavior.
4. Do we need the JS-widget/player-API capability (beyond plain iframe) for any known consumer? **Yes, needed now** — moved from the issue's draft "Out of Scope" into Scope above.
