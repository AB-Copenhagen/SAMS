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
- Filter by season, collection, category, and tag
- Fast asset loading via server-side presigned URL caching (Upstash Redis, 23 h TTL — avoids repeated round-trips to Wasabi)

### Collections
- Group assets into game-day or event collections
- Each collection tracks: name, type, date, opponent, venue, and associated season/stadium
- Cover image per collection

### AI Tagging & Player/Sponsor Recognition
- Every uploaded image is automatically analyzed by Wasabi AiR and/or Google Cloud Vision (object/scene detection, OCR, generic logo detection) — processed asynchronously via a Vercel Cron sweep, not on the upload request path
- **Player face identification** — players' headshots are enrolled once into an AWS Rekognition face collection (Configure → Players → "Enroll all faces"); new photos are searched (per detected face, not just the largest one in frame) and matched players are tagged automatically
- **Sponsor detection** — matches sponsor names/aliases against OCR text extracted from each photo (cheap — reuses OCR already being run), plus generic pretrained logo-mark detection for globally-recognized brands
- Jersey-number OCR as a secondary, lower-precision player signal (kept from the original tagging pipeline)
- High-confidence matches auto-apply as real tags; lower-confidence matches land in a review queue (visible on each player's/sponsor's photo page) requiring a human confirm/reject before becoming a visible tag

### Player & Sponsor Photo Galleries
- `/players/{id}` and `/sponsors/{id}` — every confirmed photo of a given player or sponsor, sorted by date, with pending face/sponsor match suggestions surfaced for review right on the page

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
| Auth | [Descope](https://descope.com) |
| Image/OCR/Logo Tagging | [Wasabi AiR](https://wasabi.com) & [Google Cloud Vision](https://cloud.google.com/vision) |
| Face Identification | [AWS Rekognition](https://aws.amazon.com/rekognition/) (Collections) |
| Scheduled Processing | Vercel Cron |
| Deployment | [Vercel](https://vercel.com) |

## Getting Started

### Prerequisites

- Node.js 20+
- A [Turso](https://turso.tech) database
- A [Wasabi](https://wasabi.com) bucket (+ a Wasabi AiR-enabled IAM user, optional)
- An [Upstash Redis](https://upstash.com) database
- A [Descope](https://descope.com) project
- A Google Cloud project with the Vision API enabled (optional — only needed for the GCV tagging path)
- An AWS account with Rekognition access (optional — only needed for player face identification)

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

# Wasabi AIR — dedicated IAM user credentials (create via Wasabi console → AIR), or a bearer token
WASABI_AIR_ACCESS_KEY_ID=
WASABI_AIR_SECRET_ACCESS_KEY=
WASABI_AIR_API_TOKEN=

# Google Cloud Vision — one of: service account JSON, or Vercel OIDC → GCP Workload Identity Federation
GOOGLE_CLOUD_CREDENTIALS_JSON=
GCP_WIF_AUDIENCE=
GCP_SERVICE_ACCOUNT_EMAIL=

# AWS Rekognition — player face identification (separate, narrowly-scoped IAM credentials;
# use an EU region for GDPR data residency — face vectors are biometric data)
AWS_REKOGNITION_REGION=
AWS_REKOGNITION_ACCESS_KEY_ID=
AWS_REKOGNITION_SECRET_ACCESS_KEY=
REKOGNITION_COLLECTION_ID=sams-players
REKOGNITION_AUTO_APPLY_THRESHOLD=97
REKOGNITION_SUGGEST_THRESHOLD=80
REKOGNITION_MAX_FACES_PER_IMAGE=15

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

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

`vercel.json` defines a cron job (`/api/cron/process-ingest-jobs`, every 2 minutes) that drives AI tagging, sponsor matching, and face identification. Note: Vercel's Hobby plan only runs cron jobs once a day — a Pro plan (or higher) is required for the 2-minute cadence this app is built around.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
