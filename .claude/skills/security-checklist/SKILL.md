---
name: security-checklist
description: Project-specific security checklist for media.ab.dk covering per-route auth, share-token links, device keys, and cron/webhook secrets. Use before shipping new API routes, share links, or background jobs in this repo, and alongside the general security-review skill.
metadata:
  version: '1.0.0'
---

# Security checklist — media.ab.dk

This complements the general `security-review` skill (run that on the diff as a final
pass). This skill is the "what's specific to this codebase" list — the things a
generic review won't know to check.

## There is no middleware — auth is per-route

This repo has **no `middleware.ts`**. Every `app/api/**/route.ts` is responsible for
its own authorization; there is no global gate that fails a request before it reaches
your handler. When adding a route:

- Admin/internal routes call `getCurrentUser()` from `lib/auth.ts` and return 401 if
  null (see `app/api/assets/route.ts`).
- Ingest/device routes accept either a session or a device bearer key via
  `getIngestActor()` / `verifyDeviceKey()` in `lib/device-auth.ts`.
- Public share routes (`app/api/share/[token]/**`, `app/s/[token]/**`) check
  `isShareUnlocked()` from `lib/share-auth.ts`.

**Copy the auth call from the nearest sibling route in the same directory** — don't
assume a new route is covered by anything upstream. Grep for routes missing any of
these three calls before considering a security pass done.

## Role checks, not just presence checks

Device and share actors carry a `role`. A route that only checks "is there a valid
session/token" without checking `role` will let a lower-privileged actor (e.g. an
ingest device) hit an admin-only mutation. Check `isAdmin(user)` — not just
`getCurrentUser()` truthiness — on destructive or admin routes: `assets/[id]`
DELETE/PUT/PATCH, `bulk-delete`, `merge-duplicates`, `backfill-*`, `enroll-all`,
`players/import`, `sponsors/import`, `devices/*`.

This matters more than it looks like it does today: every session is currently
hardcoded to `role: 'ADMIN'` behind the `ADMIN_EMAILS` allowlist (`lib/auth.ts`), so a
missing role check is latent, not exploitable, right now. It stops being latent the
moment self-service login ships for the already-defined `PLAYER`/`MEDIA`/`SPONSOR`
roles — add the `isAdmin()` check when you add the route, not when someone notices the
gap after non-admin login exists.

## Secret comparisons must be constant-time

Every existing secret/token comparison in this repo uses `crypto.timingSafeEqual`
(`lib/device-auth.ts`, `lib/share-auth.ts`) — never `===` on a hash, key, or signature.
Follow the same pattern for any new token/signature scheme, including matching buffer
lengths before calling `timingSafeEqual` (it throws on length mismatch).

## Cron/webhook auth: fails closed

`app/api/cron/process-ingest-jobs/route.ts`'s `authorized()` rejects the request if
`CRON_SECRET` isn't set, rather than trusting an unauthenticated caller — `CRON_SECRET`
is set in both Vercel Production and Preview. Follow the same fail-closed shape for any
**new** cron or webhook route: reject when the secret is missing, don't add a
trust-by-default fallback (the sibling `www.ab.dk` repo's `api/cron/sitemap.ts` is
another reference for this pattern).

## Share links: the token in the URL is not the whole story

Share-link access also requires an HMAC-signed unlock cookie
(`createShareUnlockCookieValue` / `isShareUnlocked` in `lib/share-auth.ts`), signed with
`SESSION_SECRET`, with an expiry check and constant-time signature comparison. Don't
weaken this to a plain token-equality check, and don't drop the `exp` check when
touching this code.

## Object storage access

Asset originals/downloads should be served via short-TTL presigned URLs
(`lib/wasabi.ts`), never by handing out long-lived or account-wide S3 credentials to a
client. If you add a new asset-serving route, check it goes through the same presigning
path as `app/api/assets/[id]/download` / `original`.

## Secrets

`SESSION_SECRET`, `CRON_SECRET`, `TURSO_AUTH_TOKEN`, QStash and Wasabi credentials, and
Descope keys are all Vercel env vars — never hardcode or log their values. The existing
code logs *that* a secret is missing (e.g. "QSTASH_TOKEN not configured") without
logging the value itself; keep that pattern for any new integration.
