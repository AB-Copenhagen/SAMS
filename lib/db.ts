import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const SQLITE_BUSY_CODE = 'P2039';

// gh-109's original budget (50/150/400ms, ~600ms total) was sized for a brief spike, but
// production kept throwing SQLITE_BUSY from `/api/collections/[id]/assets` for minutes at a
// stretch (gh-111) — the contention source (the `sync-customers`/`sync-customer-enrichment`
// crons issuing thousands of sequential writes) holds the single Turso write lock for far
// longer than 600ms can ride out. Widened to the same ~8s budget that already proved out
// against this identical failure mode in `app/api/webhooks/vivenu/route.ts`.
const RETRY_BASE_DELAYS_MS = [100, 250, 500, 1000, 2000, 4000];

const WRITE_OPERATIONS = new Set([
  'create', 'createMany', 'createManyAndReturn',
  'update', 'updateMany', 'updateManyAndReturn',
  'upsert',
  'delete', 'deleteMany',
]);

export function isRetryableBusyError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === SQLITE_BUSY_CODE;
}

// Jittered (not fixed) so concurrent requests retrying together don't resynchronize onto the
// same instant and reproduce the same contention — same reasoning as vivenu's `jittered()`.
function jittered(ms: number): number {
  return ms / 2 + Math.random() * (ms / 2);
}

// Pure decision: how long to wait before retrying a given (zero-indexed) attempt, or `undefined`
// once attempts are exhausted — kept separate from the actual IO retry loop below.
export function getBusyRetryDelayMs(attempt: number): number | undefined {
  const base = RETRY_BASE_DELAYS_MS[attempt];
  return base === undefined ? undefined : jittered(base);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Turso/libSQL has single-writer semantics: concurrent writes against the same DB (even from
// separate requests, not just a `Promise.all` within one) can collide and throw SQLITE_BUSY
// (Prisma code P2039). Rather than push retry logic into every write call site, retry it once
// here for every write operation on every model, with a short exponential backoff. Reads are
// left alone — they aren't the writer, so they don't hit this error.
function withSqliteBusyRetry(client: PrismaClient) {
  return client.$extends({
    name: 'sqlite-busy-retry',
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (!WRITE_OPERATIONS.has(operation)) return query(args);

          for (let attempt = 0; ; attempt++) {
            try {
              return await query(args);
            } catch (error) {
              const delayMs = isRetryableBusyError(error) ? getBusyRetryDelayMs(attempt) : undefined;
              if (delayMs === undefined) throw error;
              await sleep(delayMs);
            }
          }
        },
      },
    },
  });
}

function makeClient() {
  const url       = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error('TURSO_DATABASE_URL is not set');

  const adapter = new PrismaLibSql({ url, authToken });
  return withSqliteBusyRetry(new PrismaClient({ adapter }));
}

// Long-lived serverless/dev processes that reuse a single warm PrismaClient for many sequential
// polling queries (the ingest cron) have been observed to eventually serve a frozen/stale result
// for a repeated query shape via this adapter, even though writes underneath it keep committing
// correctly. Routes prone to that pattern should request a disposable client via this factory
// (and $disconnect() it when done) instead of importing the shared singleton below.
export function createPrismaClient() {
  return makeClient();
}

// The shared client is extended (see withSqliteBusyRetry above), so it's no longer structurally
// a `PrismaClient` from `@prisma/client` — it's missing `$on`, which extensions don't carry
// through. Any function taking either `prisma` or a `createPrismaClient()` result as a parameter
// should type it as `AppPrismaClient`, not the bare `PrismaClient` import.
export type AppPrismaClient = ReturnType<typeof makeClient>;

const globalForPrisma = global as unknown as { prisma?: ReturnType<typeof makeClient> };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
