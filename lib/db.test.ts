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
  it('returns an increasing delay for each attempt', () => {
    const first = getBusyRetryDelayMs(0)!;
    const second = getBusyRetryDelayMs(1)!;
    const third = getBusyRetryDelayMs(2)!;
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('returns undefined once attempts are exhausted', () => {
    expect(getBusyRetryDelayMs(3)).toBeUndefined();
    expect(getBusyRetryDelayMs(10)).toBeUndefined();
  });
});
