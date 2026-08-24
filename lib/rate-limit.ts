import { redis } from './redis';

export function requestIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Fixed-window counter shared by every Redis-backed rate limit in the app (share-link passwords,
 * session exchange, device-key verification) — one place to get the incr/expire race right
 * (only the request that actually sets the counter to 1 also sets its expiry) instead of each
 * call site reimplementing it slightly differently.
 */
export async function checkRateLimit(key: string, opts: { windowSeconds: number; max: number }): Promise<boolean> {
  const attempts = await redis.incr(key);
  if (attempts === 1) await redis.expire(key, opts.windowSeconds);
  return attempts <= opts.max;
}

// Failure-gated counterpart to checkRateLimit — for callers where legitimate traffic can be very
// frequent (e.g. a busy ingest device) and only a run of actual *failures* should ever throttle,
// never volume of valid requests. isRateLimited is a read-only check (call it before doing the
// real work); recordFailure increments only when that work turns out to have failed.
export async function isRateLimited(key: string, max: number): Promise<boolean> {
  const count = await redis.get<number>(key);
  return (count ?? 0) >= max;
}

export async function recordFailure(key: string, windowSeconds: number): Promise<void> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
}
