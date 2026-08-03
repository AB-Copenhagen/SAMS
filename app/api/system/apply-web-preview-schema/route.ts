import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

// TEMPORARY one-shot migration endpoint — applies the Asset.webPreviewKey column (added to
// prisma/schema.prisma and scripts/push-turso.mjs) to the live Turso DB. Same rationale as the
// now-deleted apply-asset-share-schema route: push-turso.mjs needs TURSO_DATABASE_URL/
// TURSO_AUTH_TOKEN, which aren't available locally right now, so this runs with the deployment's
// own runtime env vars instead. Delete this route once it's been run once against Production.
// Unauthenticated by design, matching that same precedent; the statement is idempotent
// (ADD COLUMN failure is swallowed) so re-running it is harmless.
export async function POST() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    return NextResponse.json({ message: 'TURSO_DATABASE_URL/TURSO_AUTH_TOKEN not set' }, { status: 500 });
  }

  const client = createClient({ url, authToken });
  const statements = ['ALTER TABLE "Asset" ADD COLUMN "webPreviewKey" TEXT;'];

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
