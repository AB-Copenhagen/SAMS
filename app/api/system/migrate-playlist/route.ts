import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: creates the Playlist/PlaylistItem tables (gh-128) if they don't already exist. Safe
// to call more than once — every statement is idempotent. Mirrors app/api/system/migrate-embed-token.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-playlist', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `CREATE TABLE IF NOT EXISTS "Playlist" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // Real FKs with ON DELETE CASCADE (unlike EmbedToken's polymorphic targetId) — matches
    // CollectionAsset's onDelete: Cascade relation shape in schema.prisma.
    `CREATE TABLE IF NOT EXISTS "PlaylistItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "playlistId" TEXT NOT NULL,
      "assetId" TEXT NOT NULL,
      "position" INTEGER NOT NULL,
      "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "addedBy" TEXT,
      CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE,
      CONSTRAINT "PlaylistItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PlaylistItem_playlistId_assetId_key" ON "PlaylistItem"("playlistId", "assetId")`,
    `CREATE INDEX IF NOT EXISTS "PlaylistItem_assetId_idx" ON "PlaylistItem"("assetId")`,
    `CREATE INDEX IF NOT EXISTS "PlaylistItem_playlistId_position_idx" ON "PlaylistItem"("playlistId", "position")`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  return NextResponse.json({ ok: true, applied: statements.length });
}
