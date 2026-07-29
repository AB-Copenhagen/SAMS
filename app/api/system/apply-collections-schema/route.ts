import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

// TEMPORARY one-shot migration endpoint — applies the custom-collections sharing columns/tables
// (added to prisma/schema.prisma) to the live Turso DB. Same rationale as the now-deleted
// apply-video-schema route: push-turso.mjs needs TURSO_DATABASE_URL/TURSO_AUTH_TOKEN, which aren't
// available locally, so this runs with the deployment's own runtime env vars instead. Delete this
// route once it's been run once against Production. Unauthenticated by design, matching that same
// precedent; the statements are idempotent (ADD COLUMN / CREATE ... IF NOT EXISTS failures are
// swallowed) so re-running it is harmless.
export async function POST() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    return NextResponse.json({ message: 'TURSO_DATABASE_URL/TURSO_AUTH_TOKEN not set' }, { status: 500 });
  }

  const client = createClient({ url, authToken });
  const statements = [
    'ALTER TABLE "Collection" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;',
    'ALTER TABLE "Collection" ADD COLUMN "shareToken" TEXT;',
    'ALTER TABLE "Collection" ADD COLUMN "sharePasswordSalt" TEXT;',
    'ALTER TABLE "Collection" ADD COLUMN "sharePasswordHash" TEXT;',
    'ALTER TABLE "Collection" ADD COLUMN "shareUpdatedAt" DATETIME;',
    'CREATE UNIQUE INDEX IF NOT EXISTS "Collection_shareToken_key" ON "Collection"("shareToken");',
    `CREATE TABLE IF NOT EXISTS "CollectionAsset" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "collectionId" TEXT NOT NULL,
      "assetId" TEXT NOT NULL,
      "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "addedBy" TEXT,
      CONSTRAINT "CollectionAsset_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CollectionAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    'CREATE UNIQUE INDEX IF NOT EXISTS "CollectionAsset_collectionId_assetId_key" ON "CollectionAsset"("collectionId", "assetId");',
    'CREATE INDEX IF NOT EXISTS "CollectionAsset_assetId_idx" ON "CollectionAsset"("assetId");',
    `CREATE TABLE IF NOT EXISTS "CollectionPlayerRule" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "collectionId" TEXT NOT NULL,
      "playerId" TEXT NOT NULL,
      CONSTRAINT "CollectionPlayerRule_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CollectionPlayerRule_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    'CREATE UNIQUE INDEX IF NOT EXISTS "CollectionPlayerRule_collectionId_playerId_key" ON "CollectionPlayerRule"("collectionId", "playerId");',
    `CREATE TABLE IF NOT EXISTS "CollectionSponsorRule" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "collectionId" TEXT NOT NULL,
      "sponsorId" TEXT NOT NULL,
      CONSTRAINT "CollectionSponsorRule_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CollectionSponsorRule_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
    'CREATE UNIQUE INDEX IF NOT EXISTS "CollectionSponsorRule_collectionId_sponsorId_key" ON "CollectionSponsorRule"("collectionId", "sponsorId");',
  ];

  const results: { statement: string; ok: boolean; error?: string }[] = [];
  for (const stmt of statements) {
    try {
      await client.execute(stmt);
      results.push({ statement: stmt.slice(0, 60), ok: true });
    } catch (err) {
      results.push({ statement: stmt.slice(0, 60), ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  await client.close();

  return NextResponse.json({ results });
}
