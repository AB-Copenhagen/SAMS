import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { isRetryableBusyError, getBusyRetryDelayMs } from './db';

function busyError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('SQLITE_BUSY: database is locked', {
    code,
    clientVersion: 'test',
  });
}

describe('isRetryableBusyError', () => {
  it('retries a P2039 (SQLITE_BUSY) error', () => {
    expect(isRetryableBusyError(busyError('P2039'))).toBe(true);
  });

  it('does not retry a different known Prisma error code', () => {
    expect(isRetryableBusyError(busyError('P2002'))).toBe(false);
  });

  it('does not retry a non-Prisma error', () => {
    expect(isRetryableBusyError(new Error('boom'))).toBe(false);
  });
});

describe('getBusyRetryDelayMs', () => {
  // Base delays are spaced so each attempt's jittered range (base/2 .. base) never overlaps
  // the next attempt's — e.g. [50,100] then [125,250] — so this holds across the jitter draw.
  it('returns an increasing delay for each attempt', () => {
    const delays = [0, 1, 2, 3, 4, 5].map((attempt) => getBusyRetryDelayMs(attempt)!);
    for (const delay of delays) expect(delay).toBeGreaterThan(0);
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1]);
  });

  it('stays within a jittered range of its base delay', () => {
    // attempt 2's base is 500ms (see RETRY_BASE_DELAYS_MS in lib/db.ts)
    const delay = getBusyRetryDelayMs(2)!;
    expect(delay).toBeGreaterThanOrEqual(250);
    expect(delay).toBeLessThanOrEqual(500);
  });

  it('returns undefined once attempts are exhausted', () => {
    expect(getBusyRetryDelayMs(6)).toBeUndefined();
    expect(getBusyRetryDelayMs(10)).toBeUndefined();
  });
});
