# Tech Context

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, server components) — README references v14 but `package.json` currently pins `16.3.8` |
| Language | TypeScript |
| Database | [Turso](https://turso.tech) (libSQL / SQLite) via Prisma ORM (`@prisma/adapter-libsql`, `@prisma/client` v7) |
| Object Storage | [Wasabi](https://wasabi.com) (S3-compatible), via `@aws-sdk/client-s3` / `s3-request-presigner` |
| URL Cache | [Upstash Redis](https://upstash.com) (`@upstash/redis`) |
| Job Queue | [Upstash QStash](https://upstash.com/docs/qstash) (`@upstash/qstash`) |
| Auth | [Descope](https://descope.com) (`@descope/core-js-sdk`, `@descope/react-sdk`) — two separate Descope projects: this app's staff-login project, and the consumer-facing "MyAB" project consulted read-only for the CRM |
| Face ID / Jersey OCR / Sponsor OCR | [AWS Rekognition](https://aws.amazon.com/rekognition/) Collections (`@aws-sdk/client-rekognition`), EU region required for GDPR (face vectors are biometric data) |
| CDP | [Goliath](https://goliath.si-ab.com/docs/integration) — fan segments (no per-user read endpoint; built by walking every segment) |
| Ecommerce | [Shopify](https://shopify.dev) Admin API — spend/orders |
| Email | [MailerLite](https://developers.mailerlite.com) Connect API (not legacy Classic API) |
| Ticketing | [Vivenu](https://docs.vivenu.dev) (AB's EventBilletten platform) — season passes, tickets, match attendance via `scan.created` webhook |
| Command palette | [cmdk](https://cmdk.paco.me) |
| Scheduled processing | Vercel Cron — ingest reconciliation sweep + customer sync crons, configured in `vercel.json` |
| Deployment | [Vercel](https://vercel.com) |

## Key dependencies (beyond the table above)

- `exifr` — EXIF extraction for uploaded photos.
- `hash-wasm` — client-side content hashing (SHA-256) for pre-transfer dedup on upload.
- `@vercel/sandbox`, `@vercel/oidc` — present in dependencies; check current usage before assuming active use.
- `google-auth-library` — present in dependencies; likely related to a Google integration (verify before relying on this).

## Dev setup

```bash
npm install
npx prisma generate
npm run dev
```

Environment variables are documented in `.env.example` — copy to `.env.local`. Required for the DAM: Turso, Wasabi, Upstash Redis, Descope (staff project). Optional: AWS Rekognition (face/jersey/sponsor tagging), QStash (without it, tagging falls back to the slower reconciliation cron). Required for the Customer CRM (otherwise the DAM still works): a second Descope Management Key on the consumer "MyAB" project, Goliath API key, Shopify Admin API token, MailerLite API key, Vivenu API key + webhook HMAC key.

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
