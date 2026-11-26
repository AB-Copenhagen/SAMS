# Tasks: Support embedding videos and image galleries in 3rd-party sites (ab.dk and other apps)

**Spec:** `.dmx/jobs/gh-123/spec.md`
**Branch:** feature-gh-123-support-embedding-videos-and-galleries
**Ticket:** [gh-123](https://github.com/AB-Copenhagen/SAMS/issues/123)
**Status:** Implementation complete (Phases 1–7) — two Phase 7 items need a live deploy to actually verify, see that phase

---

## Phase 1: Schema & embed token issuance

- [x] Add an `EmbedToken` table (`id`, `token` unique, `targetType` — `'asset'` | `'collection'`, `targetId`, `createdBy`, `createdAt`, `revokedAt` nullable), via the existing one-shot-admin-route convention (`CREATE TABLE IF NOT EXISTS`, mirroring `app/api/system/migrate-share-event` — `app/api/system/migrate-embed-token`), not a new column on `Asset`/`Collection`
- [x] Extended `lib/collections.ts` (not a new `lib/embed.ts` — needs the private `CONFIRMED_TAGS_INCLUDE`, see Open Learnings): `generateEmbedToken(targetType, targetId, createdBy)`, `resolveEmbedTarget(token)` (revoked treated identically to "doesn't exist", same convention as `isShareExpired`; also gates on `asset.isPublic`/`collection.isPublic` matching the sibling share-token getters), `revokeEmbedToken(token)`
- [x] Added `collectionEmbeddable(collection)` — the password-gate check (`!sharePasswordHash`). Not yet called from anywhere; Phase 4's issuance route/UI must call it before minting a token for a collection target

## Phase 2: `/embed/[token]` route

- [x] Add `app/embed/[token]/page.tsx`: resolves via `resolveEmbedTarget`, 404s on missing/revoked, renders chromeless (no `AppShell` header/nav — nothing to opt out of, `AppShell` is only ever rendered where a page imports it, same as `/s/[token]` already works) — video → `VideoPlayer`, image → `<img>`, collection → **`components/EmbedGallery.tsx`, a new minimal component — see Open Learnings for why not `PublicAssetGallery`**
- [x] **(expanded during implementation — see Open Learnings)** Embed tokens are a separate system from share tokens, so the existing `/api/assets/[id]/*`/`/api/share/[token]/assets/[assetId]/*` proxy routes don't apply — added a parallel set under `/api/embed/[token]/assets/[assetId]/{download,preview,thumbnail,hls/[...path]}`, gated via a new `resolveEmbedAssetTarget` (`lib/collections.ts`) that mirrors `resolveShareTarget`'s collection-membership/share-filter checks rather than duplicating that logic ad hoc
- [x] `postMessage` resize handshake: `components/EmbedResize.tsx` posts the embed page's rendered content height to `window.parent` on load and via `ResizeObserver`; the embedder-side listener is Phase 6's JS widget, not built here

## Phase 3: Framing security

- [x] Added `headers()` to `next.config.js` setting `Content-Security-Policy: frame-ancestors ${EMBED_ALLOWED_ORIGIN}` (default `https://www.ab.dk`, env-var-driven for non-production testing, not a multi-domain mechanism) scoped to `/embed/:token` — no `middleware.ts` exists in this repo, so this is static `next.config.js` header config, not a middleware gate
- [x] Added `lib/embed-security.ts`'s `isSameOriginEmbedRequest` (defense-in-depth against hotlinking the proxy URLs directly, bypassing the iframe entirely — `frame-ancestors` only restricts framing a document, not a direct `<img src>`/`<video src>` resource load) — checks Origin/Referer against this app's own base URL (not the `EMBED_ALLOWED_ORIGIN` destination — only *our own* `/embed/[token]` page's same-origin media loads should ever hit these routes, regardless of which site frames it), wired into all four embed proxy routes from Phase 2

## Phase 4: Self-serve embed UI

- [x] Added `components/EmbedPanel.tsx` as its own card (not an edit to `AssetSharePanel.tsx`/`CollectionSharePanel.tsx` — embed tokens are a wholly separate grant with their own lifecycle, see `activeContext.md`), rendered right after the existing share panel on both the asset detail page and the collection page. Mirrors the existing generate/copy/revoke + `router.refresh()` pattern.
- [x] `app/api/embed-tokens` (`GET` list active, `POST` create) and `app/api/embed-tokens/[token]` (`DELETE` revoke) — gated by `hasPermission(user, 'media', 'edit')`, the same gate the existing share-link PATCH routes use, per spec's self-serve/no-admin-gate requirement. `POST` for a collection target 409s via `collectionEmbeddable` if the collection is password-protected.

## Phase 5: oEmbed endpoint

- [x] Added `app/api/oembed/route.ts`: `url` query param parsed against this app's own host (never resolves an arbitrary external URL) into `/s/:token` or `/s/:token/:assetId`, resolved via the *existing* `resolveShareTarget`/`getPublicCollectionByToken` (not `resolveEmbedTarget` — the input is a share link, not an embed token), then **`getOrCreateEmbedToken`** (new shared helper, see Open Learnings) mints or reuses one, returning oEmbed-shaped JSON (`type: "rich"`, `html`, `width`/`height`, `title`). Public/unauthenticated, matching the share link's own access level — gated by the same password/`isPublic`/`collectionEmbeddable` checks those already enforce, nothing more permissive.
- [x] Added `generateMetadata` (`alternates.types['application/json+oembed']`) to `app/s/[token]/page.tsx` and `app/s/[token]/[assetId]/page.tsx` — Next.js's own mechanism for a dynamic `<link rel="alternate" type="...">`, not a hand-written `<link>` tag

## Phase 6: JS widget (player.js-style)

- [x] Added `public/embed/player.js` as a plain static file (not a route handler — no per-request logic needed, confirmed empirically via `next dev` that a static `public/` file at an exact path takes precedence over the overlapping `/embed/[token]` dynamic route, not swallowed by it). Auto-wires the resize handshake for any `<iframe data-sams-embed>` and exposes `SamsEmbed.play()`/`.pause()`/`.onResize()`.
- [x] **(expanded during implementation — see Open Learnings)** `play()`/`pause()` needed a listener on the embed-page side to actually do anything — `components/EmbedResize.tsx` (Phase 2) was renamed to `components/EmbedBridge.tsx` and extended to also receive `{ type: 'sams-embed-command' }` messages and call `.play()`/`.pause()` on the page's `<video>` element

## Phase 7: Validation & Docs

- [x] Generate an embed link and confirm it actually resolves. **First live attempt 404ed** — `resolveEmbedTarget`/`resolveEmbedAssetTarget` required `asset.isPublic`, a copy-pasted gate from the sibling share-token getters that silently coupled embeds back to the unrelated share-link toggle. Diagnosed from the live HTTP response alone (`x-matched-path: /embed/[token]` + "This page could not be found" body — route matched, resolution returned null) and fixed by dropping that gate entirely; an `EmbedToken`'s own existence/revocation is now the sole authorization. See `.dmx/systemPatterns.md` for the full writeup. Chromeless rendering/resizing across all three target types not separately re-verified after the fix.
- [x] Confirm a revoked embed token 404s immediately. Verified statically: `resolveEmbedTokenRow`'s `!embed || embed.revokedAt` check (shared by `resolveEmbedTarget` and `resolveEmbedAssetTarget`) treats a revoked token identically to a nonexistent one — a deterministic code path, not dependent on live data to trace.
- [x] Confirm framing is blocked from a non-allowlisted origin (CSP `frame-ancestors` actually takes effect). Verified empirically, not just by reading the config: `next dev` + `curl -D-` against a running `/embed/[token]` request shows `Content-Security-Policy: frame-ancestors https://www.ab.dk` present on the real HTTP response (even though the page itself 500s on the missing-DB error above — Next.js's static `headers()` config applies independently of what the dynamic route does, which is itself worth knowing).
- [ ] **Needs a live deploy — not done.** `/api/oembed` resolving a *real* share URL end-to-end (DB-dependent, same limitation as above). Its input-validation path (missing `url`, wrong host, wrong path shape) was intended to be checkable without the DB, but `lib/db.ts`'s eager `PrismaClient` construction means the whole route module fails to load without `TURSO_DATABASE_URL`, so even that couldn't be exercised here — an artifact of this sandbox, not a flaw in the route itself.
- [x] Updated `.dmx/techContext.md` and `.dmx/systemPatterns.md` with the embed-token model, the frame-ancestors-via-`next.config.js` approach (no middleware), `EMBED_ALLOWED_ORIGIN`, the hotlink-defense check, and what is/isn't verified yet

---
_Generated by /dmx/plan. Edit freely — this is your implementation contract._
