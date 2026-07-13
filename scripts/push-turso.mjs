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
    "contentHash" TEXT,
    "aiTagStatus" TEXT NOT NULL DEFAULT 'pending',
    "assetUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploaderEmail" TEXT NOT NULL,
    "uploaderRole" TEXT NOT NULL,
    "manualTagsJson" TEXT,
    "detectedTagsJson" TEXT,
    "wasbaiResponseJson" TEXT,
    "gcvResponseJson" TEXT,
    "aiDescription" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT,
    "exifJson" TEXT,
    "collectionId" TEXT,
    "seasonId" TEXT,
    CONSTRAINT "Asset_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "Asset" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "Asset" ADD COLUMN "aiTagStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Asset" ADD COLUMN "gcvResponseJson" TEXT;
ALTER TABLE "Asset" ADD COLUMN "aiDescription" TEXT;
ALTER TABLE "Asset" ADD COLUMN "faceTagStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Asset" ADD COLUMN "faceTagAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Asset" ADD COLUMN "thumbnailKey" TEXT;
ALTER TABLE "Asset" ADD COLUMN "thumbnailStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Asset" ADD COLUMN "thumbnailAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Asset" ADD COLUMN "rating" INTEGER;
ALTER TABLE "Asset" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "Asset" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "Asset" ADD COLUMN "editedKey" TEXT;
ALTER TABLE "Asset" ADD COLUMN "editParamsJson" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Asset_objectKey_key" ON "Asset"("objectKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Asset_contentHash_key" ON "Asset"("contentHash");

CREATE TABLE IF NOT EXISTS "DeviceCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEDIA',
    "scopesJson" TEXT NOT NULL DEFAULT '["ingest:write"]',
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceCredential_keyPrefix_key" ON "DeviceCredential"("keyPrefix");

CREATE TABLE IF NOT EXISTS "IngestJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT,
    "uploaderEmail" TEXT NOT NULL,
    "uploaderRole" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "contentHash" TEXT,
    "objectKey" TEXT NOT NULL,
    "uploadId" TEXT,
    "partSize" INTEGER,
    "partsTotal" INTEGER,
    "partsCompleted" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "assetId" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "IngestJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DeviceCredential" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IngestJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IngestJob_objectKey_key" ON "IngestJob"("objectKey");
CREATE UNIQUE INDEX IF NOT EXISTS "IngestJob_assetId_key" ON "IngestJob"("assetId");
CREATE INDEX IF NOT EXISTS "IngestJob_status_updatedAt_idx" ON "IngestJob"("status", "updatedAt");

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

ALTER TABLE "Player" ADD COLUMN "faceEnrolledAt" DATETIME;
ALTER TABLE "Player" ADD COLUMN "rekognitionFaceId" TEXT;

CREATE TABLE IF NOT EXISTS "Sponsor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "tier" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Sponsor" ADD COLUMN "aliasesJson" TEXT;

CREATE TABLE IF NOT EXISTS "AssetPlayerTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" REAL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    CONSTRAINT "AssetPlayerTag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetPlayerTag_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssetPlayerTag_assetId_playerId_source_key" ON "AssetPlayerTag"("assetId", "playerId", "source");
CREATE INDEX IF NOT EXISTS "AssetPlayerTag_playerId_status_idx" ON "AssetPlayerTag"("playerId", "status");

CREATE TABLE IF NOT EXISTS "AssetSponsorTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" REAL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    CONSTRAINT "AssetSponsorTag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetSponsorTag_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssetSponsorTag_assetId_sponsorId_source_key" ON "AssetSponsorTag"("assetId", "sponsorId", "source");
CREATE INDEX IF NOT EXISTS "AssetSponsorTag_sponsorId_status_idx" ON "AssetSponsorTag"("sponsorId", "status");

CREATE TABLE IF NOT EXISTS "CronRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'running',
    "errorMessage" TEXT,
    "facesDone" INTEGER NOT NULL DEFAULT 0,
    "facesSkipped" INTEGER NOT NULL DEFAULT 0,
    "facesFailed" INTEGER NOT NULL DEFAULT 0,
    "facesStillPending" INTEGER NOT NULL DEFAULT 0,
    "thumbsDone" INTEGER NOT NULL DEFAULT 0,
    "thumbsSkipped" INTEGER NOT NULL DEFAULT 0,
    "thumbsFailed" INTEGER NOT NULL DEFAULT 0,
    "thumbsStillPending" INTEGER NOT NULL DEFAULT 0,
    "uploadsAborted" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "CronRun_startedAt_idx" ON "CronRun"("startedAt");
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
