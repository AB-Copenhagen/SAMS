# System Patterns

## High-level architecture

A single Next.js App Router application, not a monorepo — one deployable unit on Vercel with two product surfaces (DAM and Customer CRM) sharing the same database, auth, and deployment:

```
app/
  api/           ← route handlers: assets, collections, customers, cron, devices, ingest,
                   jobs, players, profile, search, seasons, share, sponsors, stadiums,
                   stats, system, webhooks, auth
  customers/     ← CRM pages: dashboard, list, [id] detail, match-activity, reports
  media/, players/, sponsors/, collections/, review/, upload/, ingest/, configure/,
  analytics/, jobs/, admin/, profile/, login/, s/[token]/ (public share links)
components/      ← shared React client/server components (incl. components/charts/)
lib/             ← integration clients and domain logic, one file per concern (see below)
prisma/          ← schema.prisma — the single source of DB schema truth (no migrate; see below)
scripts/         ← one-shot/operational Node scripts (schema push, backfills, OAuth install,
                   webhook registration, CORS setup)
tools/sams-ingest/ ← standalone CLI package, separate from the deployed app
```

`lib/` is organized by external integration or domain concern rather than by layer — e.g. `vivenu.ts`, `shopify.ts`, `mailerlite.ts`, `goliath.ts`, `descope.ts`/`descope-customers.ts`, `rekognition.ts`, `wasabi.ts`, `qstash.ts`, `redis.ts` for vendor clients; `customer-reports.ts`, `customer-enrichment.ts`, `customer-sync-run.ts`, `customer-query.ts`, `tagging-pipeline.ts`, `asset-review.ts`, `sponsor-matching.ts` for domain logic that composes them.

## Key patterns

- **One generic ingest pipeline.** `/api/ingest/*` is the single entry point for every upload channel (browser, mobile, CLI/device-key) rather than separate code paths per channel.
- **Async work via QStash, cron as safety net.** Upload-completion work (AI tagging, thumbnails) is enqueued as an Upstash QStash job on the request path so it runs within seconds; a low-frequency Vercel Cron sweep only re-enqueues what QStash missed. The same split applies to customer sync: scheduled crons keep core data fresh, but third-party enrichment (Shopify/MailerLite/Vivenu) is fetched lazily on page view and TTL-cached rather than eagerly synced, because it previously caused sync timeouts.
- **Webhook over polling when the vendor API can't be queried after the fact.** Vivenu match-attendance has no "check-ins by customer" query, so attendance is captured via its `scan.created` webhook instead.
- **Non-destructive derived media.** Photo edits render into a separate `editedKey` from the pristine original (`objectKey`); re-editing always re-renders from the original so edits never compound.
- **Immediate-apply AI tagging, correct-after.** Rekognition-detected player/jersey/sponsor matches are applied as confirmed tags with no manual approval gate; a manual multi-select on the asset detail page is the correction path.
- **Run-health tracking, not just logs.** `CustomerSyncRun` rows track per-source cron health explicitly, including detecting and recovering runs that were killed mid-execution by a platform timeout (instead of leaving `status: running` forever).
- **Fixed reports over a query builder.** `/customers/reports` is four hardcoded reports; a general reporting/query-builder engine was explicitly considered and deferred as not worth the safety/permission surface yet.
- **Schema changes via one-shot admin routes/scripts, not Prisma migrations.** There is no `prisma migrate` history in this repo — `prisma/schema.prisma` is the source of truth, and changes are pushed directly via `scripts/push-turso.mjs` or shipped as one-shot `/api/system/*` admin routes (see `app/api/system/migrate-*`). See memory `schema_changes_via_admin_endpoint` in the auto-memory system for more on this convention.
- **Device-key auth for unattended clients.** Non-browser ingest clients (the CLI, future integrations) authenticate with per-device API keys minted/revoked from Configure → Devices, not a browser session.
- **Public share links.** `/s/[token]` serves public, token-gated views of assets/collections outside the staff-only auth gate — see the `security-checklist` skill for conventions on share-token links, device keys, and cron/webhook secrets.
- **Persistent top header.** `components/TopHeader.tsx`, rendered by `AppShell.tsx` above a flex row of sidebar + main content, is sticky at every breakpoint (not just mobile). Its height is `--top-header-height` in `app/globals.css`; any other sticky-positioned element in the page (`.sidebar`, `.bulk-action-bar`, `.sticky-sidebar`) must offset its own `top`/`max-height` against that variable or it will visually collide with the header. Check for this when adding a new sticky element.

## Component relationships

- `app/api/*` route handlers are thin — they call into `lib/*` for vendor calls and domain logic, and into Prisma (`lib/db.ts`) for persistence.
- `app/customers/*` pages read through `lib/customer-query.ts` / `lib/customer-reports.ts` / `lib/customer-enrichment.ts`, which in turn call the per-vendor clients (`descope-customers.ts`, `goliath.ts`, `shopify.ts`, `mailerlite.ts`, `vivenu.ts`).
- Background/cron routes (`app/api/cron/*`, `app/api/jobs/*`, `app/api/webhooks/*`) are the other entry point into the same `lib/*` domain modules, so sync logic isn't duplicated between the interactive and scheduled paths. `app/api/cron/sync-customer-enrichment` is a concrete example: it calls the exact same `refreshCustomerExternalData` (`lib/customer-enrichment.ts`) that the customer detail page calls lazily, just in batches across every customer with a resume cursor (`SyncState`) — so a platform's per-customer staleness gating (`isExternalDataStale`) stays in one place regardless of which path triggers the refresh.
- `components/charts/*` (AreaChart, BarChart, Meter, StackedBarChart) are shared visualization primitives used by both the CRM dashboard/reports and (where relevant) DAM analytics.
- Auth gating (`lib/auth.ts`, `lib/staff-users.ts`) sits in front of both product surfaces. The login gate is an invite-only local roster, not Descope role or email domain (gh-76, superseding gh-72's domain-based gate): `app/api/auth/session/route.ts` looks up the authenticated Descope session's email in the `StaffUser` table (`lib/staff-users.ts`'s `findStaffUserByEmail` + pure `resolveLoginDecision`) — no row, or a `SUSPENDED` one, is rejected regardless of email domain; `PENDING`/`ACTIVE` are admitted with that row's role (`USER`/`STAFF`/`ADMIN`), and `PENDING` flips to `ACTIVE` on that first login. An Admin invites anyone by email from Admin → Users (`app/admin/users`) before they've necessarily ever logged in. Descope's own role console (`resolveAppRole`/`isAllowedEmailDomain` in `lib/descope.ts`, plus `DESCOPE_ADMIN_ROLE`/`DESCOPE_STAFF_ROLE`/`DESCOPE_ALLOWED_DOMAIN`) is kept as inert, unused-by-login-path config — Descope now only verifies identity/session, not authorization. `PLAYER`/`MEDIA`/`SPONSOR` are separate device-credential-ownership labels, not login roles at all. Because role is now cached in a session cookie evaluated only at login (not per-request), the cookie's `maxAge` was cut from 90 days to 24 hours so a `SUSPENDED` status takes effect within a bounded window instead of up to 90 days.
- **Pure decision function at the login gate.** `resolveLoginDecision` in `lib/staff-users.ts` is the entire allow/reject/role decision as one pure function with no Prisma/IO inside it — the IO (`findStaffUserByEmail`, `markActive`) stays in separate functions the route composes. Follow this split for other business-rule decisions: keep the actual decision testable and pure, isolate IO at the edges, per this repo's functional-first style.
- **Module permission matrix, not scattered role checks.** `lib/auth.ts`'s `hasPermission(user, module, action)`/`requirePermission(...)` (gh-72) is the one place that decides whether a role can View/Add/Edit/Delete each of the three gated modules (`media`, `crm`, `adminSettings`) — a static `PERMISSION_MATRIX`, not per-route role comparisons. New routes/pages gating one of those three modules should call `hasPermission`/`requirePermission`, not `isAdmin`/`isStaffOrAdmin` directly; those two remain only for the handful of non-module gates (e.g. `app/api/system/*`'s one-shot admin maintenance routes, deliberately kept `isAdmin`-only and outside the module matrix).
