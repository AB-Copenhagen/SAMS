// One-time cutover script: enqueues a QStash job for every asset still sitting `pending` from
// before this deploy (the poll-based cron used to pick these up itself; QStash jobs are now only
// enqueued at ingest completion, so anything already `pending` needs a manual nudge once).
// Usage: node scripts/backfill-qstash-jobs.mjs

import { createClient } from '@libsql/client';
import { Client as QstashClient } from '@upstash/qstash';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const eq = l.indexOf('=');
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
    })
);

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, QSTASH_TOKEN, APP_BASE_URL } = env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error('TURSO_DATABASE_URL or TURSO_AUTH_TOKEN missing from .env.local');
  process.exit(1);
}
if (!QSTASH_TOKEN || !APP_BASE_URL) {
  console.error('QSTASH_TOKEN or APP_BASE_URL missing from .env.local — set these up before backfilling');
  process.exit(1);
}

const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
const qstash = new QstashClient({ token: QSTASH_TOKEN });
const base = APP_BASE_URL.replace(/\/$/, '');

const pendingFaces = await db.execute("SELECT id FROM \"Asset\" WHERE faceTagStatus = 'pending'");
const pendingThumbs = await db.execute("SELECT id FROM \"Asset\" WHERE thumbnailStatus = 'pending'");

let ok = 0;
for (const row of pendingFaces.rows) {
  await qstash.publishJSON({ url: `${base}/api/jobs/tag-asset`, body: { assetId: row.id }, retries: 4, failureCallback: `${base}/api/jobs/failed` });
  ok++;
}
for (const row of pendingThumbs.rows) {
  await qstash.publishJSON({ url: `${base}/api/jobs/generate-thumbnail`, body: { assetId: row.id }, retries: 4, failureCallback: `${base}/api/jobs/failed` });
  ok++;
}

console.log(`Enqueued ${pendingFaces.rows.length} tagging job(s) and ${pendingThumbs.rows.length} thumbnail job(s) — ${ok} total.`);
db.close();
