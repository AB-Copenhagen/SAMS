import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

function makeClient() {
  const url       = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error('TURSO_DATABASE_URL is not set');

  const adapter = new PrismaLibSql({ url, authToken });
  return new PrismaClient({ adapter });
}

// Long-lived serverless/dev processes that reuse a single warm PrismaClient for many sequential
// polling queries (the ingest cron) have been observed to eventually serve a frozen/stale result
// for a repeated query shape via this adapter, even though writes underneath it keep committing
// correctly. Routes prone to that pattern should request a disposable client via this factory
// (and $disconnect() it when done) instead of importing the shared singleton below.
export function createPrismaClient(): PrismaClient {
  return makeClient();
}

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
