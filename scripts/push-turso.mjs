// One-shot script: applies the Prisma schema to Turso via libsql client.
// Usage: node scripts/push-turso.mjs

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

// Parse .env.local manually (Next.js env files aren't loaded by plain Node)
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const eq = l.indexOf('=');
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
    })
);

const url       = env.TURSO_DATABASE_URL;
const authToken = env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('TURSO_DATABASE_URL or TURSO_AUTH_TOKEN missing from .env.local');
  process.exit(1);
}

const client = createClient({ url, authToken });

const sql = `
CREATE TABLE IF NOT EXISTS "Season" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Stadium" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'game',
    "date" DATETIME,
    "opponent" TEXT,
    "venue" TEXT,
    "coverUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seasonId" TEXT,
    "stadiumId" TEXT,
    CONSTRAINT "Collection_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Collection_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "description" TEXT,
    "eventName" TEXT,
    "eventDate" DATETIME,
    "location" TEXT,
    "objectKey" TEXT NOT NULL,
    "assetUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploaderEmail" TEXT NOT NULL,
    "uploaderRole" TEXT NOT NULL,
    "manualTagsJson" TEXT,
    "detectedTagsJson" TEXT,
    "wasbaiResponseJson" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT,
    "exifJson" TEXT,
    "collectionId" TEXT,
    "seasonId" TEXT,
    CONSTRAINT "Asset_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Asset_objectKey_key" ON "Asset"("objectKey");

CREATE TABLE IF NOT EXISTS "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "number" INTEGER,
    "position" TEXT,
    "headshotUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "team" TEXT,
    "seasonId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Player_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Sponsor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "tier" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const statements = sql
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith('--'));

let ok = 0;
for (const stmt of statements) {
  try {
    await client.execute(stmt + ';');
    ok++;
  } catch (err) {
    console.error('Failed:', stmt.slice(0, 60) + '…');
    console.error(err.message);
  }
}

console.log(`Done — ${ok}/${statements.length} statements applied to ${url}`);
await client.close();
