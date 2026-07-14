# SAMS — Sports Asset Management System

A Digital Asset Manager (DAM) built for professional soccer teams. SAMS centralises all club photography, video, and visual assets — organised by season, game, and event — with role-based access for staff, players, media partners, and sponsors.

## Features

### Asset Management
- Upload photos and videos directly to Wasabi S3-compatible object storage via presigned URLs (browser uploads bypass the server entirely)
- Resumable multipart upload for large files, with pre-transfer content-hash dedup (re-uploading the same file is detected before any bytes move)
- Bulk upload with drag-and-drop, concurrent uploads with per-file progress
- Rich metadata per asset: title, description, event name/date, location, category, and free-text tags
- EXIF data extraction and display for photography
- Asset detail view with inline metadata editing and combobox autocomplete for stadium and event/match fields

### Bulk & Automated Ingest
- Generic `/api/ingest/*` API used by every ingest channel (browser, mobile, unattended scripts) — one pipeline, not three
- Device API keys (Configure → Devices) let unattended tools authenticate without a browser session
- `tools/sams-ingest` — a standalone CLI for bulk/automated ingest from a Mac/PC:
  - `sams-ingest watch <folder>` — tails a folder (e.g. a DSLR tethering app's "save to" location) and ingests new files as they land
  - `sams-ingest import <folder>` — recursively ingests everything already in a folder (e.g. a mounted portable hard drive)
  - Streams a SHA-256 hash per file for dedup, uses multipart upload for large RAW/video files, and keeps a local ledger so re-running `import` on the same drive is idempotent
- `/ingest/mobile` — a mobile-optimized capture page for field photographers (camera capture, in-browser hashing/dedup, works over a logged-in session)
- A "Live ingest" panel (polling, not websockets) shows in-flight uploads from every channel in near-real time

### Media Library
- Searchable, filterable grid of all club assets
- Filter by season, collection, category, tag, and minimum star rating
- Fast asset loading via server-side presigned URL caching (Upstash Redis, 23 h TTL — avoids repeated round-trips to Wasabi)

### Collections
- Group assets into game-day or event collections
- Each collection tracks: name, type, date, opponent, venue, and associated season/stadium
- Cover image per collection

### AI Tagging & Player/Sponsor Recognition
- Every uploaded image is automatically analyzed by AWS Rekognition — enqueued as an [Upstash QStash](https://upstash.com/docs/qstash) job the moment upload completes (not on the upload request path itself), so photos are typically tagged within seconds rather than waiting on a fixed poll interval. A low-frequency reconciliation sweep (Vercel Cron, every 15 min) re-enqueues anything that slips through
- **Player face identification** — players' headshots are enrolled once into an AWS Rekognition face collection (Configure → Players → "Enroll all faces"); new photos are searched (per detected face, not just the largest one in frame) and matched players are tagged automatically
- **Jersey number & name recognition** — reads jersey numbers and printed surnames off the back of a shirt, spatially grounded against a detected person in the frame
- **Sponsor detection** — matches sponsor names/aliases against text detected anywhere in the frame (LED boards, banners, crests — not just jerseys), reusing the same text-detection call made for jersey recognition
- All detected matches are applied immediately as confirmed tags — no manual review gate — so newly uploaded photos show their players/sponsors right away; incorrect tags are corrected afterward via the manual multi-select on the asset detail page

### Player & Sponsor Photo Galleries
- `/players/{id}` and `/sponsors/{id}` — every confirmed photo of a given player or sponsor, sorted by date, with pending face/sponsor match suggestions surfaced for review right on the page

### Fast Review Workflow
- `/review` — a keyboard-driven queue for rating newly ingested photos, optimized for speed over a large backlog
- Surfaces one un-reviewed image at a time (a photo becomes eligible once its face/sponsor tagging has settled, so a rating reflects the fully-tagged asset); next image is prefetched in the background so rating has no perceptible loading delay
- Rate 1-4 stars with a single keypress or click; optimistic UI advances immediately to the next image without waiting on the network round-trip
- Every rating is logged on the asset (`rating`, `reviewedAt`, `reviewedBy`) — re-rating an already-reviewed photo (e.g. from its asset detail page) updates the reviewer/timestamp again
- A sidebar nav badge shows the current count of un-reviewed images

### Photo Editor
- Available from any asset detail page — crop, brightness, contrast, saturation, and one-click auto color correction, plus grayscale/sepia/vivid filters, all with a live preview
- Non-destructive: edits are rendered from the pristine original into a single derived version (`editedKey`); the original file is never overwritten and stays reachable via a dedicated "original" route. Re-editing re-renders from the original, so edits never compound
- Edits apply immediately to the asset everywhere it's shown (media grid, galleries, downloads) once saved; revertible back to the original at any time
- **Export presets** — render and download a copy sized for a specific destination without affecting the saved asset: Web-optimized (1920px wide), Instagram square (1080×1080), Instagram story (1080×1920), Facebook (1200×630), LinkedIn (1200×627)

### Configure
- **Seasons** — define season periods; all assets, collections, and players are scoped to a season
- **Players** — roster management with headshots stored in Wasabi; headshot changes automatically re-enroll the player's face
- **Sponsors** — sponsor directory with logos, tier classification, and OCR-matching aliases (e.g. "XYZ" for "XYZ Byggefirma A/S")
- **Stadiums** — venue list used for autocomplete across the app
- **Devices** — mint/revoke API keys for unattended ingest tools (the CLI, future integrations)

### Authentication & Access Control
- Powered by [Descope](https://descope.com) — passwordless, SSO, and social login out of the box
- Four roles: `ADMIN`, `PLAYER`, `MEDIA`, `SPONSOR`
- User profile management via embedded Descope profile widget (`/profile`)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, server components) |
| Language | TypeScript |
| Database | [Turso](https://turso.tech) (libSQL / SQLite) via Prisma ORM |
| Object Storage | [Wasabi](https://wasabi.com) (S3-compatible) |
| URL Cache | [Upstash Redis](https://upstash.com) |
| Job Queue | [Upstash QStash](https://upstash.com/docs/qstash) |
| Auth | [Descope](https://descope.com) |
| Face ID / Jersey OCR / Sponsor OCR | [AWS Rekognition](https://aws.amazon.com/rekognition/) (Collections) |
| Scheduled Processing | Vercel Cron (reconciliation sweep only) |
| Deployment | [Vercel](https://vercel.com) |

## Getting Started

### Prerequisites

- Node.js 20+
- A [Turso](https://turso.tech) database
- A [Wasabi](https://wasabi.com) bucket
- An [Upstash Redis](https://upstash.com) database
- A [Descope](https://descope.com) project
- An AWS account with Rekognition access (optional — only needed for player face/jersey/sponsor tagging)

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```
# Turso
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# Wasabi
WASABI_REGION=
WASABI_ENDPOINT=
WASABI_BUCKET=
WASABI_ACCESS_KEY_ID=
WASABI_SECRET_ACCESS_KEY=

# AWS Rekognition — player face/jersey/sponsor identification (separate, narrowly-scoped IAM
# credentials; use an EU region for GDPR data residency — face vectors are biometric data)
AWS_REKOGNITION_REGION=
AWS_REKOGNITION_ACCESS_KEY_ID=
AWS_REKOGNITION_SECRET_ACCESS_KEY=

# Optional tuning (all have sensible built-in defaults, shown here for reference only):
# REKOGNITION_COLLECTION_ID=sams-players
# REKOGNITION_SUGGEST_THRESHOLD=80
# REKOGNITION_MAX_FACES_PER_IMAGE=15

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Upstash QStash — job queue for post-upload tagging/thumbnail generation
# If QSTASH_TOKEN is unset, jobs silently aren't enqueued at upload time and only get picked up
# by the (much slower) reconciliation cron sweep.
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# Canonical https URL of this deployment — QStash calls back to ${APP_BASE_URL}/api/jobs/*
APP_BASE_URL=

# Descope
NEXT_PUBLIC_DESCOPE_PROJECT_ID=
DESCOPE_SERVICE_ACCOUNT_KEY=

# Session signing — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=

# Optional: protects the Vercel Cron endpoint from being called by anyone who finds the URL
CRON_SECRET=

# Optional: api-football.com key, only needed for the fixture/match importer
API_FOOTBALL_KEY=
```

### Install & Run

```bash
npm install
npx prisma generate
npm run dev
```

### One-time infra setup

Schema changes are applied directly to Turso (no `prisma migrate` — see `scripts/push-turso.mjs`):

```bash
node scripts/push-turso.mjs          # apply/update the database schema
node scripts/setup-wasabi-cors.mjs   # allow browser presigned-URL uploads
node scripts/setup-rekognition-collection.mjs   # create the player face collection (run once)
```

After the Rekognition collection exists, enroll your squad's faces from Configure → Players → "Enroll all faces".

### CLI ingest tool

```bash
cd tools/sams-ingest
node bin/sams-ingest.mjs watch <folder> --api-url https://your-deployment --token <device-key> --channel dslr
node bin/sams-ingest.mjs import <folder> --api-url https://your-deployment --token <device-key> --channel hdd
```

Mint a device key from Configure → Devices in the app first.

### Deploy

```bash
vercel --prod
```

Player/sponsor tagging and thumbnail generation run as [Upstash QStash](https://upstash.com/docs/qstash) jobs, enqueued directly at upload completion — set `APP_BASE_URL` to this deployment's own URL so QStash knows where to call back, and configure the QStash project's signing keys (`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`) so `/api/jobs/*` only accepts genuine QStash requests. `vercel.json` still defines a cron job (`/api/cron/process-ingest-jobs`, every 15 minutes) but it now only sweeps stuck multipart uploads and re-enqueues any asset that's been stuck `pending` for an unexpectedly long time — a safety net, not the primary path. If you're migrating an existing deployment with assets already `pending` from before this change, run `node scripts/backfill-qstash-jobs.mjs` once after deploying to enqueue jobs for them immediately instead of waiting on the sweep.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
