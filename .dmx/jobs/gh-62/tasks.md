# Tasks — gh-62: Record guest/unlinked check-ins in Match Activity report

## Phase 1 — Schema + table creation

- [ ] Add `GuestCheckin` model to `prisma/schema.prisma`: `id`, `eventId`, `ticketId` (unique), `scannedAt`, `createdAt`.
- [ ] Regenerate the Prisma client.
- [ ] Add `app/api/system/add-guest-checkin-table/route.ts` (one-shot admin route, following `migrate-vivenu-fields`'s pattern) to create the table in production.

## Phase 2 — Webhook: record guest check-ins instead of dropping them

- [ ] In `app/api/webhooks/vivenu/route.ts`, when `ticket.customerId` is missing, or no local `Customer` matches `vivenuCustomerId`, write a `GuestCheckin` row (`ticketId` unique — upsert or ignore-on-conflict so re-entry scans don't duplicate) instead of returning `ignored` with no write.
- [ ] Keep the existing `eventType !== 'SINGLE'` ignore path as a true no-op (not a guest check-in).

## Phase 3 — Report + UI: "Guest check-ins" stat

- [ ] `lib/customer-reports.ts`: extend `MatchActivitySummary` with `guestCheckins`; `getMatchActivityUncached` counts `GuestCheckin` rows whose `eventId` is in the requested `eventIds`.
- [ ] `app/customers/match-activity/page.tsx`: add a "Guest check-ins" stat card to the stat row, alongside Tickets sold / Checked in / No-show / Check-in rate.
- [ ] Confirm `noShow` math is unchanged (still `ticketsSold - checkedIn`, guests excluded).

## Phase 4 — One-shot backfill for the 2026-10-24 match

- [ ] Add `app/api/system/backfill-match-checkins-20261024/route.ts`: given the 234 `(ticketId, eventId)` pairs captured from that match's webhook logs, replay the resolution logic (`getTicket` → `customerId` → `Customer` lookup → attendance update, else `GuestCheckin` insert). Idempotent against already-recorded attendance.
- [ ] Set `maxDuration` to accommodate ~234 throttled Vivenu calls (~1.5 min) plus margin.
- [ ] Do not invoke this route automatically — the developer triggers it once the branch is deployed.

## Phase 5 — Validate

- [ ] Run `/dmx/validate` (or manual pass) against this spec's Scope before PR.
