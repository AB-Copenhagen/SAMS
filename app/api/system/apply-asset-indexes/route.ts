import { NextResponse } from 'next/server';
import { createClient, type Client as LibsqlClient } from '@libsql/client';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';

// One-time migration: the Asset table had no indexes beyond its unique constraints, so every
// filtered/sorted gallery, review-queue, and cron-reconciliation query full-scanned it. Mirrors
// the six @@index entries added to prisma/schema.prisma and scripts/push-turso.mjs — this route
// exists only so the same statements can be run against Production without pulling production
// Turso credentials down to a local machine. GET previews which indexes are still missing; POST
// creates them (idempotent — CREATE INDEX IF NOT EXISTS). Run once against Production, then
// remove this route.
const INDEXES: { name: string; sql: string }[] = [
  { name: 'Asset_uploadedAt_idx', sql: 'CREATE INDEX IF NOT EXISTS "Asset_uploadedAt_idx" ON "Asset"("uploadedAt")' },
  { name: 'Asset_seasonId_uploadedAt_idx', sql: 'CREATE INDEX IF NOT EXISTS "Asset_seasonId_uploadedAt_idx" ON "Asset"("seasonId", "uploadedAt")' },
  { name: 'Asset_collectionId_idx', sql: 'CREATE INDEX IF NOT EXISTS "Asset_collectionId_idx" ON "Asset"("collectionId")' },
  { name: 'Asset_category_idx', sql: 'CREATE INDEX IF NOT EXISTS "Asset_category_idx" ON "Asset"("category")' },
  { name: 'Asset_faceTagStatus_uploadedAt_idx', sql: 'CREATE INDEX IF NOT EXISTS "Asset_faceTagStatus_uploadedAt_idx" ON "Asset"("faceTagStatus", "uploadedAt")' },
  { name: 'Asset_thumbnailStatus_uploadedAt_idx', sql: 'CREATE INDEX IF NOT EXISTS "Asset_thumbnailStatus_uploadedAt_idx" ON "Asset"("thumbnailStatus", "uploadedAt")' },
];

function rawLibsqlClient(): LibsqlClient {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

async function existingIndexNames(db: LibsqlClient): Promise<Set<string>> {
  const result = await db.execute('PRAGMA index_list("Asset")');
  return new Set(result.rows.map((row) => String(row.name)));
}

// Dry-run preview — reports which of the six indexes are already applied vs. still missing.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const db = rawLibsqlClient();
  try {
    const existing = await existingIndexNames(db);
    return NextResponse.json({
      applied: INDEXES.filter((i) => existing.has(i.name)).map((i) => i.name),
      missing: INDEXES.filter((i) => !existing.has(i.name)).map((i) => i.name),
    });
  } finally {
    db.close();
  }
}

export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const db = rawLibsqlClient();
  const created: string[] = [];
  try {
    for (const index of INDEXES) {
      await db.execute(index.sql);
      created.push(index.name);
    }
  } finally {
    db.close();
  }

  return NextResponse.json({ created });
}
