// One-time import: catalogs the legacy ScorePlay export sitting under scoreplay/ in Wasabi
// (manually copied there outside this app) into the DAM proper. Every media file has a
// same-basename .json sidecar with ScorePlay's own structured export (collection/date/season/
// player+sponsor tags) — see Phase 0 inventory findings for the full per-folder manifest this
// script's folder->type mapping and merge decisions were based on (no merges needed; every
// folder is its own distinct fixture).
//
// Objects are referenced in place (objectKey keeps the original scoreplay/<folder>/<file> path,
// no copy to assets/) — same bucket, no reason to move the bytes.
//
// Resumable: re-running skips any objectKey already present as an Asset, and reuses an existing
// Collection/Season row by name instead of recreating it, so a partial/interrupted run is safe
// to just re-run.
//
// Usage:
//   node scripts/import-scoreplay-assets.mjs                                   # dry run, all folders
//   node scripts/import-scoreplay-assets.mjs --folder="Training"               # dry run, one folder
//   node scripts/import-scoreplay-assets.mjs --execute --folder="Socials" --limit=5   # smoke test
//   node scripts/import-scoreplay-assets.mjs --execute                         # full real run
//
// Dry run only lists+pairs files and reports counts per folder — it does not download media or
// touch the database. --execute performs the real hashing/writes/enqueueing.

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client as QStashClient } from '@upstash/qstash';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; })
);

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const FOLDER_FILTER = (args.find((a) => a.startsWith('--folder=')) || '').slice('--folder='.length).replace(/^"(.*)"$/, '$1') || null;
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').slice('--limit='.length)) || Infinity;

for (const key of ['WASABI_REGION', 'WASABI_ENDPOINT', 'WASABI_BUCKET', 'WASABI_ACCESS_KEY_ID', 'WASABI_SECRET_ACCESS_KEY', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']) {
  if (!env[key]) {
    console.error(`${key} missing from .env.local — this script needs real Wasabi + Turso credentials, not the blank local placeholders.`);
    process.exit(1);
  }
}

const s3 = new S3Client({
  region: env.WASABI_REGION,
  endpoint: env.WASABI_ENDPOINT,
  credentials: { accessKeyId: env.WASABI_ACCESS_KEY_ID, secretAccessKey: env.WASABI_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});
const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
const qstash = env.QSTASH_TOKEN ? new QStashClient({ token: env.QSTASH_TOKEN }) : null;

// Confirmed by the Phase 0 inventory — everything else under scoreplay/ is a game fixture.
const NON_GAME_TYPES = {
  'Training': 'training',
  'First Training - Season 26-27': 'training',
  'Socials': 'social',
  'Investor and Fan Content': 'investor',
};

const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
};

function randomId() {
  return randomBytes(16).toString('hex');
}

function extMime(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return EXT_MIME[ext] || 'application/octet-stream';
}

function buildPublicUrl(objectKey) {
  const host = env.WASABI_ENDPOINT.replace(/\/$/, '').replace(/^https?:\/\//, '');
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  return `https://${host}/${env.WASABI_BUCKET}/${encodedKey}`;
}

function normalizeName(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function listTopLevelFolders() {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: env.WASABI_BUCKET, Prefix: 'scoreplay/', Delimiter: '/' }));
  return (res.CommonPrefixes ?? [])
    .map((p) => p.Prefix.replace(/^scoreplay\//, '').replace(/\/$/, ''))
    .filter(Boolean);
}

async function listAllObjects(prefix) {
  const out = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: env.WASABI_BUCKET, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }));
    for (const obj of res.Contents ?? []) out.push({ key: obj.Key, size: obj.Size });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

function pairFiles(objects, folderPrefix) {
  const byBase = new Map();
  for (const { key, size } of objects) {
    const rel = key.slice(folderPrefix.length);
    if (!rel) continue; // the folder marker key itself
    const dot = rel.lastIndexOf('.');
    if (dot === -1) { console.warn(`  ! skipping extensionless key: ${key}`); continue; }
    const base = rel.slice(0, dot);
    const ext = rel.slice(dot + 1).toLowerCase();
    const entry = byBase.get(base) || {};
    if (ext === 'json') entry.jsonKey = key;
    else { entry.mediaKey = key; entry.filename = rel; entry.size = size; }
    byBase.set(base, entry);
  }
  const pairs = [];
  for (const [base, entry] of byBase) {
    if (entry.mediaKey && entry.jsonKey) pairs.push(entry);
    else console.warn(`  ! skipping unpaired file "${base}" (${entry.mediaKey ? 'no json sidecar' : 'media file missing'})`);
  }
  return pairs;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function fetchJson(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.WASABI_BUCKET, Key: key }));
  const buf = await streamToBuffer(res.Body);
  return JSON.parse(buf.toString('utf-8'));
}

async function hashObject(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.WASABI_BUCKET, Key: key }));
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of res.Body) { hash.update(chunk); size += chunk.length; }
  return { hex: hash.digest('hex'), size, contentType: res.ContentType };
}

async function publishJob(path, body) {
  if (!qstash || !env.APP_BASE_URL) return false;
  const base = env.APP_BASE_URL.replace(/\/$/, '');
  await qstash.publishJSON({ url: `${base}${path}`, body, retries: 4, failureCallback: `${base}/api/jobs/failed` });
  return true;
}

const seasonCache = new Map();
async function getOrCreateSeason(name) {
  if (!name) return null;
  if (seasonCache.has(name)) return seasonCache.get(name);
  const existing = await db.execute({ sql: `SELECT id FROM Season WHERE name = ?`, args: [name] });
  let id = existing.rows[0]?.id;
  if (!id) {
    id = randomId();
    await db.execute({ sql: `INSERT INTO Season (id, name, createdAt) VALUES (?, ?, datetime('now'))`, args: [id, name] });
    console.log(`  + created Season "${name}"`);
  }
  seasonCache.set(name, id);
  return id;
}

const collectionCache = new Map();
async function getOrCreateCollection(folderName, sidecar) {
  if (collectionCache.has(folderName)) return collectionCache.get(folderName);
  const type = NON_GAME_TYPES[folderName] || 'game';
  const seasonName = sidecar.seasons?.[0] || null;
  const seasonId = await getOrCreateSeason(seasonName);
  const date = sidecar.collection?.date || null;

  const existing = await db.execute({ sql: `SELECT id FROM Collection WHERE name = ?`, args: [folderName] });
  let id = existing.rows[0]?.id;
  if (!id) {
    id = randomId();
    await db.execute({
      sql: `INSERT INTO Collection (id, name, type, date, seasonId, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      args: [id, folderName, type, date, seasonId],
    });
    console.log(`  + created Collection "${folderName}" (${type}${date ? `, ${date}` : ''})`);
  }
  const result = { id, seasonId };
  collectionCache.set(folderName, result);
  return result;
}

let playerMap, sponsorMap;
async function loadLookupMaps() {
  const players = (await db.execute(`SELECT id, name FROM Player`)).rows;
  playerMap = new Map(players.map((p) => [normalizeName(p.name), p.id]));

  const sponsors = (await db.execute(`SELECT id, name, aliasesJson FROM Sponsor`)).rows;
  sponsorMap = new Map();
  for (const s of sponsors) {
    sponsorMap.set(normalizeName(s.name), s.id);
    if (s.aliasesJson) {
      try {
        for (const alias of JSON.parse(s.aliasesJson)) sponsorMap.set(normalizeName(alias), s.id);
      } catch { /* malformed aliasesJson on an existing row — not this script's problem to fix */ }
    }
  }
}

async function insertTag(table, idCol, assetId, entityId) {
  const id = randomId();
  try {
    await db.execute({
      sql: `INSERT INTO ${table} (id, assetId, ${idCol}, source, status, createdAt) VALUES (?, ?, ?, 'scoreplay', 'suggested', datetime('now'))`,
      args: [id, assetId, entityId],
    });
  } catch (err) {
    console.warn(`    ! failed to insert ${table} for asset ${assetId}: ${err.message}`);
  }
}

const stats = { created: 0, skippedExistingKey: 0, skippedDupHash: 0, failed: 0, dryRunCounted: 0 };
const unmatchedPlayers = new Map();
const unmatchedSponsors = new Map();

async function processPair(folderName, pair) {
  const { mediaKey, jsonKey, filename, size } = pair;

  if (!EXECUTE) { stats.dryRunCounted++; return; }

  const existing = await db.execute({ sql: `SELECT id FROM Asset WHERE objectKey = ?`, args: [mediaKey] });
  if (existing.rows.length) { stats.skippedExistingKey++; return; }

  let sidecar;
  try {
    sidecar = await fetchJson(jsonKey);
  } catch (err) {
    console.error(`  FAIL ${mediaKey}: couldn't read sidecar — ${err.message}`);
    stats.failed++;
    return;
  }

  const collection = await getOrCreateCollection(folderName, sidecar);

  let hashed;
  try {
    hashed = await hashObject(mediaKey);
  } catch (err) {
    console.error(`  FAIL ${mediaKey}: download/hash failed — ${err.message}`);
    stats.failed++;
    return;
  }

  const dup = await db.execute({ sql: `SELECT id FROM Asset WHERE contentHash = ?`, args: [hashed.hex] });
  if (dup.rows.length) {
    console.log(`  = skip (already in DAM as ${dup.rows[0].id}): ${mediaKey}`);
    stats.skippedDupHash++;
    return;
  }

  const fileType = hashed.contentType || extMime(filename);
  const capturedTime = sidecar.dates?.captured_time;
  const exifJson = (capturedTime && !capturedTime.startsWith('0000:'))
    ? JSON.stringify({ DateTimeOriginal: capturedTime })
    : null;

  const playerNames = [...new Set((sidecar.players ?? []).map((p) => p.name).filter(Boolean))];
  const sponsorNames = [...new Set((sidecar.sponsors ?? []).map((s) => s.name).filter(Boolean))];
  const matchedPlayerIds = [];
  for (const name of playerNames) {
    const id = playerMap.get(normalizeName(name));
    if (id) matchedPlayerIds.push(id);
    else unmatchedPlayers.set(name, (unmatchedPlayers.get(name) ?? 0) + 1);
  }
  const matchedSponsorIds = [];
  for (const name of sponsorNames) {
    const id = sponsorMap.get(normalizeName(name));
    if (id) matchedSponsorIds.push(id);
    else unmatchedSponsors.set(name, (unmatchedSponsors.get(name) ?? 0) + 1);
  }

  // Our own Rekognition pipeline never runs for this import (cost + time tradeoff) — player tags
  // come only from ScorePlay's own sidecar data where it matches an existing Player row. 'skipped'
  // (not 'pending') still lets these surface in the review queue normally.
  const faceTagStatus = 'skipped';

  const assetId = randomId();
  const tagNames = (sidecar.tags ?? []).map((t) => t.name).filter(Boolean);

  try {
    await db.execute({
      sql: `INSERT INTO Asset (
        id, description, eventName, eventDate, objectKey, contentHash,
        aiTagStatus, assetUrl, fileType, fileSize, uploaderEmail, uploaderRole,
        manualTagsJson, exifJson, collectionId, seasonId,
        faceTagStatus, faceTagAttempts, thumbnailStatus, thumbnailAttempts,
        isPublic, importSource, legacyMetaJson
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        'pending', ?, ?, ?, ?, 'ADMIN',
        ?, ?, ?, ?,
        ?, 0, 'pending', 0,
        0, 'scoreplay', ?
      )`,
      args: [
        assetId, sidecar.description || null, folderName, sidecar.collection?.date || null, mediaKey, hashed.hex,
        buildPublicUrl(mediaKey), fileType, hashed.size, 'scoreplay-import@ab-media.internal',
        JSON.stringify(tagNames), exifJson, collection.id, collection.seasonId,
        faceTagStatus, JSON.stringify(sidecar),
      ],
    });
  } catch (err) {
    console.error(`  FAIL ${mediaKey}: insert failed — ${err.message}`);
    stats.failed++;
    return;
  }

  for (const playerId of matchedPlayerIds) await insertTag('AssetPlayerTag', 'playerId', assetId, playerId);
  for (const sponsorId of matchedSponsorIds) await insertTag('AssetSponsorTag', 'sponsorId', assetId, sponsorId);

  // Thumbnail generation only — no tag-asset enqueue, Rekognition is intentionally skipped for
  // this import.
  await publishJob('/api/jobs/generate-thumbnail', { assetId });

  console.log(`  OK ${assetId} — ${mediaKey} (${matchedPlayerIds.length} player tag(s), ${matchedSponsorIds.length} sponsor tag(s))`);
  stats.created++;
}

async function main() {
  console.log(EXECUTE ? '*** EXECUTE mode — writing to the database ***' : 'Dry run (pass --execute to actually import)');
  if (FOLDER_FILTER) console.log(`Folder filter: "${FOLDER_FILTER}"`);
  if (LIMIT !== Infinity) console.log(`Limit: ${LIMIT} assets`);

  if (EXECUTE) await loadLookupMaps();

  const allFolders = await listTopLevelFolders();
  const folders = FOLDER_FILTER ? allFolders.filter((f) => f === FOLDER_FILTER) : allFolders;
  if (FOLDER_FILTER && folders.length === 0) {
    console.error(`No folder named "${FOLDER_FILTER}" found under scoreplay/. Available: ${allFolders.join(', ')}`);
    process.exit(1);
  }

  let totalProcessed = 0;
  for (const folderName of folders) {
    if (totalProcessed >= LIMIT) break;
    const prefix = `scoreplay/${folderName}/`;
    const objects = await listAllObjects(prefix);
    const pairs = pairFiles(objects, prefix);
    console.log(`\n${folderName}: ${pairs.length} media file(s)`);

    for (const pair of pairs) {
      if (totalProcessed >= LIMIT) break;
      await processPair(folderName, pair);
      totalProcessed++;
    }
  }

  console.log('\n=== Summary ===');
  if (!EXECUTE) {
    console.log(`Dry run: ${stats.dryRunCounted} media file(s) would be processed across ${folders.length} folder(s). Re-run with --execute to actually import.`);
  } else {
    console.log(`Created:              ${stats.created}`);
    console.log(`Skipped (existing key): ${stats.skippedExistingKey}`);
    console.log(`Skipped (dup hash):     ${stats.skippedDupHash}`);
    console.log(`Failed:                 ${stats.failed}`);
    if (unmatchedPlayers.size) {
      console.log(`\nUnmatched player names (not found in Player table — review and fix names, or add players, then re-run):`);
      for (const [name, count] of [...unmatchedPlayers].sort((a, b) => b[1] - a[1])) console.log(`  ${count}x  ${name}`);
    }
    if (unmatchedSponsors.size) {
      console.log(`\nUnmatched sponsor names:`);
      for (const [name, count] of [...unmatchedSponsors].sort((a, b) => b[1] - a[1])) console.log(`  ${count}x  ${name}`);
    }
  }

  db.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
