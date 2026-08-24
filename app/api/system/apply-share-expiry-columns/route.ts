import { NextResponse } from 'next/server';
import { createClient, type Client as LibsqlClient } from '@libsql/client';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';

// One-time migration: adds the expiresAt columns backing time-boxed share links, matching the
// prisma/schema.prisma and scripts/push-turso.mjs additions. SQLite has no "ADD COLUMN IF NOT
// EXISTS", so this checks PRAGMA table_info first rather than relying on the statement failing
// harmlessly. Exists only so it can be run against Production without pulling production Turso
// credentials down to a local machine — see app/api/system/apply-asset-indexes (removed) for the
// precedent. Run once against production, then delete this route.
const COLUMNS: { table: string; name: string }[] = [
  { table: 'Collection', name: 'expiresAt' },
  { table: 'Asset', name: 'expiresAt' },
];

function rawLibsqlClient(): LibsqlClient {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

async function hasColumn(db: LibsqlClient, table: string, column: string): Promise<boolean> {
  const result = await db.execute(`PRAGMA table_info("${table}")`);
  return result.rows.some((row) => String(row.name) === column);
}

// Dry-run preview — reports which columns are already applied vs. still missing.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const db = rawLibsqlClient();
  try {
    const status = await Promise.all(
      COLUMNS.map(async (c) => ({ ...c, applied: await hasColumn(db, c.table, c.name) })),
    );
    return NextResponse.json({
      applied: status.filter((c) => c.applied).map((c) => `${c.table}.${c.name}`),
      missing: status.filter((c) => !c.applied).map((c) => `${c.table}.${c.name}`),
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
    for (const c of COLUMNS) {
      if (await hasColumn(db, c.table, c.name)) continue;
      await db.execute(`ALTER TABLE "${c.table}" ADD COLUMN "${c.name}" DATETIME`);
      created.push(`${c.table}.${c.name}`);
    }
  } finally {
    db.close();
  }

  return NextResponse.json({ created });
}
