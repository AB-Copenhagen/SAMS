import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: adds the two columns the ScorePlay import (scripts/import-scoreplay-assets.mjs) needs
// on Asset — importSource (e.g. "scoreplay") and legacyMetaJson (the raw ScorePlay sidecar, kept
// for traceability). Unlike CREATE TABLE/INDEX elsewhere in this file, SQLite has no
// "ADD COLUMN IF NOT EXISTS" — each statement is tried independently and a "duplicate column"
// error (from calling this more than once) is reported but not fatal, same tolerance as
// scripts/push-turso.mjs's apply loop.
//   fetch('/api/system/add-scoreplay-import-fields', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `ALTER TABLE "Asset" ADD COLUMN "importSource" TEXT`,
    `ALTER TABLE "Asset" ADD COLUMN "legacyMetaJson" TEXT`,
    `CREATE INDEX IF NOT EXISTS "Asset_importSource_idx" ON "Asset"("importSource")`,
  ];

  const results = [];
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push({ sql, ok: true });
    } catch (err) {
      results.push({ sql, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ results });
}
