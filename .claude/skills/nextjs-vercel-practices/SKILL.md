---
name: nextjs-vercel-practices
description: Project-specific Next.js App Router + Vercel conventions for media.ab.dk (media-ab-dam). Use when adding or reviewing API routes, background jobs, cron endpoints, or Vercel config in this repo.
metadata:
  version: '1.0.0'
---

# Next.js + Vercel practices — media.ab.dk

This is a Next.js 16 App Router app (React 19) on Vercel. For generic Next.js/Vercel
guidance (rendering strategies, caching primitives, Functions config, env vars), defer
to the `vercel:nextjs` and `vercel:vercel-functions` skills — this skill only covers
conventions specific to this repo's stack, so it doesn't repeat that material.

## Stack shape

- **DB**: Prisma 7 over `@prisma/adapter-libsql` against Turso (`lib/db.ts`). `build`
  runs `prisma generate && next build` — any new Prisma model needs a migration, not a
  manual schema edit.
- **Object storage**: Wasabi (S3-compatible) via `lib/wasabi.ts`, always through
  presigned URLs — see the security-checklist skill.
- **Background jobs**: Upstash QStash (`lib/qstash.ts`) publishes to dedicated route
  handlers under `app/api/jobs/*` (e.g. `tag-asset`, `generate-thumbnail`). A periodic
  Vercel Cron (`app/api/cron/process-ingest-jobs`) only does reconciliation — sweeping
  stuck multipart uploads and re-enqueueing stale jobs — it does not do the work itself.
- **Auth**: Descope-backed sessions (`lib/auth.ts`), plus a separate device-key scheme
  for ingest devices (`lib/device-auth.ts`) and HMAC-signed share-unlock cookies for
  public share links (`lib/share-auth.ts`).
- **Media processing**: `sharp` + `exifr` run in Vercel Functions (Node runtime, not
  Edge — both are native/WASM-touching and won't work on Edge). `exifr` is listed in
  `next.config.js`'s `serverExternalPackages`; add any new native/binary dependency
  there too or the build will try to bundle it.
- **Vercel Sandbox** (`@vercel/sandbox`) and **Vercel OIDC** (`@vercel/oidc`) are already
  dependencies — check existing usage before introducing a new sandboxing or
  credential-federation approach.

## Route handler conventions

- Every route lives at `app/api/**/route.ts` and exports `GET`/`POST`/etc. directly —
  there is **no `middleware.ts`** in this repo. Auth is enforced per-route (see
  security-checklist). When adding a new route, look at a sibling route in the same
  area first and match its auth call, not just its response shape.
- Routes with side effects, or that must reflect live DB state (cron, mutations),
  explicitly set `export const dynamic = 'force-dynamic'` and often
  `export const fetchCache = 'force-no-store'` — copy this from
  `app/api/cron/process-ingest-jobs/route.ts` rather than relying on defaults.
- Long-running routes set `export const maxDuration` explicitly (the cron route uses
  60s). Don't let a new heavy route fall back to the platform default without
  considering whether it needs this.
- Keep request handlers thin: if work can plausibly exceed a few seconds (tagging,
  thumbnailing, bulk imports), enqueue it via `lib/qstash.ts` to a job route instead of
  doing it inline — that's the existing pattern for every expensive operation in this
  codebase.

## Data & queries

- Build Prisma `where` clauses compositionally (see `app/api/assets/route.ts`'s `AND`
  array pattern) rather than string-concatenating query fragments.
- The one place raw SQL is used (`rawLibsqlClient()` in the cron route) is deliberate
  (worked around a Prisma-engine-specific stale-read bug) and still fully parameterized
  via `args`. Don't extend raw-SQL usage elsewhere without the same rationale and the
  same parameterization discipline.

## Deploy config

- `vercel.json` only declares the cron schedule — anything else (env, headers,
  redirects) should go through `vercel env` / project settings unless there's a reason
  to move it into version control.
- New cron or webhook routes should be added to `vercel.json`'s `crons` array and given
  a `CRON_SECRET`-gated check — see security-checklist for the specific gotcha in the
  existing cron route.
