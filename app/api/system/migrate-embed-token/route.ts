import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: creates the EmbedToken table (gh-123) if it doesn't already exist. Safe to call more
// than once — every statement is idempotent. Mirrors app/api/system/migrate-share-event.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-embed-token', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `CREATE TABLE IF NOT EXISTS "EmbedToken" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "token" TEXT NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "revokedAt" DATETIME
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "EmbedToken_token_key" ON "EmbedToken"("token")`,
    `CREATE INDEX IF NOT EXISTS "EmbedToken_targetType_targetId_idx" ON "EmbedToken"("targetType", "targetId")`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  return NextResponse.json({ ok: true, applied: statements.length });
}
