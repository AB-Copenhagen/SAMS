// Minimum-interval throttle for outbound calls to a rate-limited third-party API. Deliberately
// in-process (a Map, not Redis-backed like lib/rate-limit.ts, which protects SAMS's own inbound
// routes from abuse across concurrent callers/instances) — the problem this solves is a single
// cron invocation's tight sequential loop (app/api/cron/sync-customer-enrichment) blowing
// through a per-minute limit within one execution, not something that needs cross-instance
// coordination. Vercel Cron doesn't run overlapping invocations of the same path, so one
// in-memory map per invocation is exactly the right scope.
const lastCallAt = new Map<string, number>();

export async function throttle(key: string, minIntervalMs: number): Promise<void> {
  const last = lastCallAt.get(key) ?? 0;
  const wait = last + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt.set(key, Date.now());
}
