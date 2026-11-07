# Tech Context

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, server components) — README references v14 but `package.json` currently pins `16.4.5` |
| Language | TypeScript 7 — the native (Go-ported) compiler; ships per-platform optional binary packages (`@typescript/typescript-<platform>`), same shape as esbuild/swc |
| Database | [Turso](https://turso.tech) (libSQL / SQLite) via Prisma ORM (`@prisma/adapter-libsql`, `@prisma/client` v7) |
| Object Storage | [Wasabi](https://wasabi.com) (S3-compatible), via `@aws-sdk/client-s3` / `s3-request-presigner` |
| URL Cache | [Upstash Redis](https://upstash.com) (`@upstash/redis`) |
| Job Queue | [Upstash QStash](https://upstash.com/docs/qstash) (`@upstash/qstash`) |
| Auth | [Descope](https://descope.com) (`@descope/core-js-sdk`, `@descope/react-sdk`) — two separate Descope projects: this app's staff-login project, and the consumer-facing "MyAB" project consulted read-only for the CRM |
| Face ID / Jersey OCR / Sponsor OCR | [AWS Rekognition](https://aws.amazon.com/rekognition/) Collections (`@aws-sdk/client-rekognition`), EU region required for GDPR (face vectors are biometric data) |
| CDP | [Goliath](https://goliath.si-ab.com/docs/integration) — fan segments (walked via the documented Segments API), plus `GET /public/users/{id}` for a single field (`lastActiveAt`) — undocumented (absent from Goliath's own `GET /docs-json` OpenAPI spec), confirmed working live, risk accepted deliberately (gh-91) |
| Ecommerce | [Shopify](https://shopify.dev) Admin API — spend/orders |
| Email | [MailerLite](https://developers.mailerlite.com) Connect API (not legacy Classic API) |
| Ticketing | [Vivenu](https://docs.vivenu.dev) (AB's EventBilletten platform) — season passes, tickets, match attendance via `scan.created` webhook |
| Command palette | [cmdk](https://cmdk.paco.me) |
| Tests | [Vitest](https://vitest.dev) (`npm test`) — added gh-72 as the project's first test runner; bumped `^2` → `^5` (gh-105), which peer-requires `@types/node@^22 \|\| >=24`, so that bump pulled the previously-separate `@types/node@^26` major along with it. Config file is `vitest.config.mts` (renamed from `.ts`, gh-105 — vitest 5's `configLoader: 'native'` warns on ESM syntax loaded as CommonJS without this) |
| Scheduled processing | Vercel Cron — ingest reconciliation sweep + customer sync crons, configured in `vercel.json` |
| Deployment | [Vercel](https://vercel.com) |

## Key dependencies (beyond the table above)

- `exifr` — EXIF extraction for uploaded photos.
- `hash-wasm` — client-side content hashing (SHA-256) for pre-transfer dedup on upload.
- `@vercel/sandbox` — actively used: `lib/video-thumbnail.ts` runs `ffmpeg`/`ffprobe` in a snapshot-based sandbox to generate video poster frames (confirmed gh-105). No unit test covers this file; a live run needs a real video plus `VIDEO_SANDBOX_SNAPSHOT_ID`, so verify manually after touching it.
- `@vercel/oidc` — confirmed **not used anywhere** in `lib/`, `app/`, or `scripts/` (gh-105); only declared in `package.json` (`@vercel/sandbox` carries its own separate nested copy as a transitive dep). Likely safe to remove — worth a follow-up ticket to confirm and drop it.
- `google-auth-library` — present in dependencies; likely related to a Google integration (verify before relying on this).

## Dev setup

```bash
npm install
npx prisma generate
npm run dev
```

Environment variables are documented in `.env.example` — copy to `.env.local`. Required for the DAM: Turso, Wasabi, Upstash Redis, Descope (staff project). Optional: AWS Rekognition (face/jersey/sponsor tagging), QStash (without it, tagging falls back to the slower reconciliation cron). Required for the Customer CRM (otherwise the DAM still works): a second Descope Management Key on the consumer "MyAB" project, Goliath API key, Shopify Admin API token, MailerLite API key, Vivenu API key + webhook HMAC key.

Without real `TURSO_DATABASE_URL`/Upstash Redis credentials, `npm run build` fails at Next's page-data-collection step (gh-105) — this is expected, not a regression. Verify a full build via `vercel deploy` (preview) instead when real local credentials aren't available.

After deleting `node_modules`/`package-lock.json` for a clean dependency-resolution reinstall (sometimes necessary for a major bump's peer dependencies to resolve), `npx prisma generate` must be re-run manually before tests or anything importing the Prisma client will work — `npm install` alone doesn't regenerate it, only the `build` script does (gh-105).

**One-time infra setup** (run once per environment, not part of normal deploys):
```bash
node scripts/push-turso.mjs                      # apply/update DB schema — see Constraints below
node scripts/setup-wasabi-cors.mjs               # allow browser presigned-URL uploads
node scripts/setup-rekognition-collection.mjs    # create the player face collection
node scripts/shopify-oauth-install.mjs <shop>.myshopify.com   # mint Shopify Admin API token
node scripts/vivenu-register-webhook.mjs         # register scan.created webhook, mint HMAC key
```

**CLI ingest tool** (separate package, not deployed with the app):
```bash
cd tools/sams-ingest
node bin/sams-ingest.mjs watch <folder> --api-url <url> --token <device-key> --channel dslr
node bin/sams-ingest.mjs import <folder> --api-url <url> --token <device-key> --channel hdd
```

**Deploy:** `vercel --prod`.

## Constraints

- **No `prisma migrate`.** `prisma/schema.prisma` is the source of truth, but schema changes ship as one-shot scripts (`scripts/push-turso.mjs`) or one-shot admin API routes (`app/api/system/migrate-*`), not a tracked migration history. Keep this in mind before assuming a migrations folder exists or adding one casually.
- **Two distinct Descope projects.** `NEXT_PUBLIC_DESCOPE_PROJECT_ID`/`DESCOPE_SERVICE_ACCOUNT_KEY` are this app's own staff-login project; `DESCOPE_CUSTOMER_PROJECT_ID`/`DESCOPE_CUSTOMER_MANAGEMENT_KEY` are the separate consumer "MyAB" project the CRM reads from. Do not conflate them.
- **Vivenu identity link is not email.** The join key is Vivenu's own `Customer._id`, sourced from a Descope custom attribute (default name `eventbillettenUuid`, overridable via `DESCOPE_VIVENU_ATTRIBUTE_KEY`).
- **QStash is optional but changes behavior silently.** Without `QSTASH_TOKEN` set, upload-time tagging/thumbnail jobs simply aren't enqueued and only get picked up by the much slower reconciliation cron sweep — no error is raised.
- **Node.js 20+** required per README prerequisites (Vercel's own default runtime has since moved to Node 24 LTS per platform guidance — verify which applies when touching runtime config).
- **AWS Rekognition region should be EU** for GDPR data residency, since enrolled face vectors are biometric data.
- **Cron/webhook endpoints need their own auth**, not the staff session (`CRON_SECRET` for cron, `VIVENU_API_KEY`/webhook HMAC validation for the Vivenu webhook, device API keys for unattended ingest) — see the `security-checklist` skill before adding new routes of this kind.
- **Descope SDK widgets (`UserProfile`, the `Descope` flow component) wrap browser-only custom elements** (`customElements.define()`). Rendering one directly lets Next.js SSR a placeholder that the client then hydrates into the real custom element, which React can't reconcile — causing a hydration error that can leave the widget in a broken state. Always render these via `next/dynamic(..., { ssr: false })`, per the existing pattern in `components/DescopeLoginForm.tsx` and `components/ProfileClient.tsx`.
- **Role/access no longer lives in Descope at all (gh-76).** gh-72's `listStaffUsers`/`setUserRole` (which called Descope's Management API directly from `/admin/users`) were removed after they hit Descope's rate limit on every page view. `DESCOPE_ADMIN_ROLE`/`DESCOPE_STAFF_ROLE`/`DESCOPE_ALLOWED_DOMAIN` and `resolveAppRole`/`isAllowedEmailDomain` in `lib/descope.ts` are kept but are now dead code on the login path — don't extend them expecting them to affect access; see `lib/staff-users.ts` instead.
- **`lib/db.ts`'s `prisma` export constructs a `PrismaClient` at module-import time**, not lazily — any file that transitively imports it (directly or via another `lib/` module) will throw at import time without `TURSO_DATABASE_URL` set, even in a unit test that never actually queries the DB. `vitest.config.mts`'s `test.env.TURSO_DATABASE_URL` placeholder exists for exactly this (gh-76, found when `lib/staff-users.ts` pulled `lib/db.ts` into `lib/auth.ts`'s import graph and broke `lib/auth.test.ts`).
- **A dependency bump to its documented "latest" can still reintroduce a vulnerability via a nested transitive copy.** `@vercel/sandbox@3.9.1` (gh-105's upgrade target, confirmed the actual latest release) bundles its own independently-vulnerable nested `@vercel/oidc`/`zod`, even though the top-level `@vercel/oidc` had already been patched. Fixed via the `overrides` block in `package.json` (same pattern as the pre-existing `undici` override there). Run `npm audit` after *every* dependency bump in this repo, not only the ones targeting a known CVE.
- **Goliath's `GET /public/segments` is scoped per-project.** AB's `GOLIATH_API_KEY` returned `totalRecords: 0` even for a segment confirmed active in the Goliath dashboard (gh-91, 2026-10-27) — Goliath's own OpenAPI spec says segments are "for the authenticated project," so a key seeing zero segments likely means it's scoped to a different Goliath project than the dashboard view, not that the key is broken or lacks permissions generally (`GET /public/users/{id}` worked fine with the same key).
- **Goliath also has a pre-go-live analytics event-stream spec** (`/docs/integration/datatalks-analytics`): the Goliath mobile app POSTs batched events to a partner-implemented `POST {base-url}/events/batch` endpoint (inbound to the partner, not a webhook subscription), including `platform`/`appVersion` data this app doesn't currently receive. Written for a named partner ("DataTalks"), auth scheme undecided — see gh-92 before building anything on it.
