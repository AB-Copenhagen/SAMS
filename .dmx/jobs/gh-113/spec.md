---
ticket: gh-113
branch: feature-gh-113-track-descope-user-counts-over-time
summary: Track Descope user counts over time (added/lost) with a CRM chart and metrics table
ticketing: github-issues
---

# Track Descope user counts over time (added/lost) with CRM chart and metrics table

**Ticket:** [#113](https://github.com/AB-Copenhagen/SAMS/issues/113)
**Type:** feature
**Branch:** feature-gh-113-track-descope-user-counts-over-time

---

## Context

`app/customers/reports/page.tsx` already has a customer growth chart (`getCustomerGrowthByMonthUncached()` in `lib/customer-reports.ts`), but it's a live, monthly-bucketed **cumulative total** computed from `Customer.descopeCreatedAt`. It has no "lost" concept and can't gain one from the local `Customer` table as-is: the daily `sync-customers` cron (`app/api/cron/sync-customers/route.ts`) only **upserts** Descope users via `iterateAllCustomers()` (`lib/descope-customers.ts`) — a user removed from Descope is never detected or removed locally, so the `Customer` table's total only ever grows and isn't a reliable source for "current real Descope total." There's also no persisted point-in-time snapshot of any metric anywhere in the schema — `CustomerSyncRun`/`CronRun` log individual sync runs, not metric values over time.

We want a daily-granularity view of total Descope user count over time, broken into existing/added/lost, with a chart and a metrics table in the CRM.

## Scope
- Factor the full Descope user-ID walk (`iterateAllCustomers()`) so the daily `sync-customers` cron run can also capture today's complete ID set — no second full Descope API scan.
- At the end of that same cron run, diff today's ID set against yesterday's stored set and persist a new daily snapshot: `date`, `totalCount`, `addedCount`, `lostCount`, and today's raw ID list (for tomorrow's diff).
- Backfill the `addedCount`/added-history series from existing `Customer.descopeCreatedAt` data back to each account's real creation date. `lostCount`/accurate `totalCount` history still only starts from when this snapshot logic first runs (no way around that, per Context).
- Prune raw per-day ID lists after 90 days; aggregate counts (`totalCount`/`addedCount`/`lostCount`) are kept forever.
- Add a new section to `app/customers/reports/page.tsx` (alongside the existing growth chart) with:
  - A chart of added vs. lost users per day, using the existing hand-rolled `components/charts/` components (e.g. `StackedBarChart.tsx`) — no charting library exists in this repo today, and this shouldn't introduce one.
  - A table of the underlying metrics (date, total, added, lost) using the existing `asset-table`/`asset-table-wrap` conventions.
- Update `.dmx/techContext.md` with the new snapshot table/mechanism once implemented.

## Out of Scope
- Changing how `Customer` rows are upserted/deleted today, beyond capturing the ID set needed for this feature (local `Customer` rows stay as-is; nothing gets deleted)
- A separate new cron job — the snapshot logic rides inside the existing daily `sync-customers` run, deliberately avoiding another independent cron that writes to Turso (gh-109/gh-111 already covered the cost of concurrent/frequent cron writes against this DB; adding a new cron here would reintroduce that same risk class)
- Re-deriving "lost" for periods before this feature ships

## Technical Approach
- `lib/descope-customers.ts`: factor `iterateAllCustomers()` (or add a thin wrapper) so `app/api/cron/sync-customers/route.ts` can collect the full set of Descope user IDs it already walks, without a second scan.
- `prisma/schema.prisma`: add a `DescopeUserSnapshot` model — `date` (unique, day granularity), `totalCount`, `addedCount`, `lostCount`, `idsJson` (nullable — null once pruned), `createdAt`.
- At the end of `sync-customers`'s run: diff today's ID set against the most recent prior `DescopeUserSnapshot.idsJson` to compute `addedCount`/`lostCount` for days after this ships; compute `totalCount` directly from today's ID set length (not from the `Customer` table). Write one new `DescopeUserSnapshot` row.
- A small cleanup step (same cron run, or folded into the existing reconciliation pattern) nulls out `idsJson` on snapshots older than 90 days.
- One-time backfill (migration script or one-shot admin route, per this repo's "no `prisma migrate`" convention) to populate historical `DescopeUserSnapshot` rows' `addedCount` from existing `Customer.descopeCreatedAt` data — `totalCount`/`lostCount` left null/0 for pre-feature dates since they can't be reconstructed.
- `app/customers/reports/page.tsx` / `lib/customer-reports.ts`: new query reading `DescopeUserSnapshot` rows, a `StackedBarChart` (added vs. lost per day) plus a plain table, following existing page conventions.

---

## Questions
<!-- Answer each question before running /dmx/plan. -->

1. Local `Customer` rows are never deleted on Descope-side removal, so the live `Customer` table can't tell us today's actual Descope total — only Descope itself can. How should daily added/lost be computed?
   Answer: Diff full ID sets day-over-day — fetch today's complete Descope user-ID set (piggybacking on the existing `sync-customers` walk, no extra API scan), store it, and diff against yesterday's stored set.

2. Should the "added" series be backfilled from existing `Customer.descopeCreatedAt` data back to each account's real creation date?
   Answer: Yes. "Lost" and accurate "total" still only start from when the snapshot logic first runs.

3. Where should the new chart + table live in the CRM?
   Answer: New section on the existing `app/customers/reports/page.tsx`, alongside the existing customer-growth chart.

4. If diffing full ID sets day-over-day, how long should the raw per-day ID list be kept?
   Answer: Prune after 90 days. Aggregate counts (`totalCount`/`addedCount`/`lostCount`) are kept forever regardless.
