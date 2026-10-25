# Product Context

## Why this exists

A pro soccer club generates a constant stream of game-day and event media across many photographers and channels (DSLR tethering, portable hard drives, mobile field capture), and separately runs its fan relationship across five disconnected vendor systems (auth, CDP, ecommerce, email, ticketing). Before SAMS, media was scattered across folders/drives with no consistent tagging or review pipeline, and no staff member had one place to answer "what does this fan's relationship with the club actually look like."

SAMS solves both by being the single system of record: a DAM that gets media tagged and reviewable within seconds of upload, and a CRM that stitches five vendor APIs into one per-fan timeline keyed on a shared identity.

## How it works

**DAM side:**
- Assets enter via one generic ingest pipeline (`/api/ingest/*`) regardless of source — browser bulk upload, mobile capture page, or the `sams-ingest` CLI authenticated with a device API key.
- Upload completion enqueues an Upstash QStash job immediately for AI tagging (Rekognition: face match against an enrolled player collection, jersey number/name OCR, sponsor text detection) and thumbnail generation; a 15-minute Vercel Cron sweep is a safety net for anything QStash misses, not the primary path.
- All AI-detected matches apply immediately as confirmed tags (no manual approval gate); staff correct mistakes afterward via multi-select on the asset detail page.
- `/review` is a single-image-at-a-time, keyboard-driven rating queue tuned for clearing a large backlog fast — prefetching the next image and using optimistic UI so rating never waits on the network.
- The photo editor renders non-destructively from the pristine original into one derived `editedKey`, so repeated edits never compound; export presets render on-demand copies for specific destinations (web, Instagram, Facebook, LinkedIn) without touching the saved asset.

**CRM side:**
- Every fan record is anchored on their Descope `userId` from the separate "MyAB" consumer project.
- Three sync crons (`sync-customers`, `sync-goliath-segments`, `sync-descope-logins`) keep core identity/segment/login data fresh; each run's health is tracked in a `CustomerSyncRun` row, including recovery of runs killed mid-execution by a platform timeout.
- Shopify/MailerLite/Vivenu data is fetched lazily on fan detail-page view (TTL-cached) rather than eagerly synced for every fan — most fans never touch all three platforms, and eager enrichment was a real contributor to sync timeouts as the fan base grew.
- Vivenu match attendance arrives via a `scan.created` webhook (Vivenu's API has no way to query check-ins by customer after the fact, so polling isn't an option).
- The fan detail page keeps a real append-only activity log (logins, consent changes, segment changes, orders, ticket purchases, match check-ins, MailerLite status changes) rather than just a snapshot of current state.
- `/customers/reports` intentionally ships four fixed reports instead of a general query builder — covers what's been asked for, and a query builder's safety/permission surface wasn't worth building speculatively.

**Shared admin shell (DAM + CRM):**
- A persistent top header (name, role, profile link, sign-out) spans every authenticated staff page; it replaced an earlier sidebar-footer block. Global search lives in the header as an always-visible, instant-results input rather than a Cmd+K-triggered modal — the modal's keyboard shortcut was dropped after reports it was unreliable.
- Public share views (`/s/[token]`) stay outside this shell entirely.

## Who uses it

- **Club staff / media team** — the primary users of both the DAM (upload, tag-correction, review, editing) and the CRM (fan lookups, reports). Any `@ab.dk` Descope user can log in by default (role `USER`); `STAFF`/`ADMIN` are elevated tiers an Admin assigns (Admin → Users), and View/Add/Edit/Delete access to Media Assets/CRM/Admin Settings follows a fixed per-tier permission matrix rather than login itself being the access gate (gh-72).
- **Field/press photographers** — use the mobile ingest page or the DSLR/HDD-watching CLI tool, often one-handed and under time pressure; see `press-worker-usability` skill for UX conventions this drives.
- **Players, media partners, sponsors** — referenced as subjects/owners of content (player face galleries, sponsor galleries, device-credential ownership) but are not users of the admin back-office itself.
- **Unattended ingest tools** — authenticate via per-device API keys (Configure → Devices) rather than a browser session.
