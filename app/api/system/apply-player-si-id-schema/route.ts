import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

// TEMPORARY one-shot migration endpoint — applies the Player.siPlayerId column (added to
// prisma/schema.prisma and scripts/push-turso.mjs) to the live Turso DB. Needed because
// push-turso.mjs requires TURSO_DATABASE_URL/TURSO_AUTH_TOKEN, which aren't available locally
// right now (see chat) — this runs with the deployment's own runtime env vars instead. Delete
// this route once it's been run once against Production. Unauthenticated by design, matching
// the precedent set by apply-video-schema; the statements are idempotent (ADD COLUMN failures
// are swallowed) so re-running it is harmless.
export async function POST() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    return NextResponse.json({ message: 'TURSO_DATABASE_URL/TURSO_AUTH_TOKEN not set' }, { status: 500 });
  }

  const client = createClient({ url, authToken });
  const statements = [
    'ALTER TABLE "Player" ADD COLUMN "siPlayerId" TEXT;',
    'CREATE UNIQUE INDEX IF NOT EXISTS "Player_siPlayerId_key" ON "Player"("siPlayerId");',
  ];

  const results: { statement: string; ok: boolean; error?: string }[] = [];
  for (const stmt of statements) {
    try {
      await client.execute(stmt);
      results.push({ statement: stmt, ok: true });
    } catch (err) {
      results.push({ statement: stmt, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  await client.close();

  return NextResponse.json({ results });
}
