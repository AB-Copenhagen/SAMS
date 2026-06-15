# SAMS — Sports Asset Management System

A Digital Asset Manager (DAM) built for professional soccer teams. SAMS centralises all club photography, video, and visual assets — organised by season, game, and event — with role-based access for staff, players, media partners, and sponsors.

## Features

### Asset Management
- Upload photos and videos directly to Wasabi S3-compatible object storage via presigned URLs (browser uploads bypass the server entirely)
- Bulk upload with drag-and-drop
- Rich metadata per asset: title, description, event name/date, location, category, and free-text tags
- EXIF data extraction and display for photography
- Asset detail view with inline metadata editing and combobox autocomplete for stadium and event/match fields

### Media Library
- Searchable, filterable grid of all club assets
- Filter by season, collection, category, and tag
- Fast asset loading via server-side presigned URL caching (Upstash Redis, 23 h TTL — avoids repeated round-trips to Wasabi)

### Collections
- Group assets into game-day or event collections
- Each collection tracks: name, type, date, opponent, venue, and associated season/stadium
- Cover image per collection

### Configure
- **Seasons** — define season periods; all assets, collections, and players are scoped to a season
- **Players** — roster management with headshots stored in Wasabi
- **Sponsors** — sponsor directory with logos and tier classification
- **Stadiums** — venue list used for autocomplete across the app

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
| Deployment | [Vercel](https://vercel.com) |

## Getting Started

### Prerequisites

- Node.js 20+
- A [Turso](https://turso.tech) database
- A [Wasabi](https://wasabi.com) bucket
- An [Upstash Redis](https://upstash.com) database
- A [Descope](https://descope.com) project

### Environment Variables

Create a `.env.local` file:

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

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Descope
NEXT_PUBLIC_DESCOPE_PROJECT_ID=
```

### Install & Run

```bash
npm install
npx prisma generate
npm run dev
```

### Deploy

```bash
vercel --prod
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
