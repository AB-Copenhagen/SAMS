// One-time backfill: ~20 legacy assets (uploaded 2026-06-15) are stuck at faceTagStatus='pending'
// because they predate the async ingest pipeline and their aiTagStatus never settled — a gate
// that no longer exists now that Wasabi AiR has been removed entirely. This runs the same
// face + jersey-number identification as lib/rekognition.ts's identifyPlayersInImage directly
// against these assets (bypassing the app/cron, since the local dev server is unreliable in this
// sandbox right now) and applies the same upsert semantics as lib/asset-tags.ts.
// Usage: node scripts/backfill-legacy-face-tags.mjs
import {
  RekognitionClient,
  DetectFacesCommand,
  SearchFacesByImageCommand,
  DetectTextCommand,
} from '@aws-sdk/client-rekognition';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@libsql/client';
import sharp from 'sharp';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; })
);

const collectionId = env.REKOGNITION_COLLECTION_ID || 'sams-players';
const DETECT_FACE_MIN_CONFIDENCE = 90;
const DETECT_TEXT_MIN_CONFIDENCE = 80;
const JERSEY_VERTICAL_REACH_FACE_HEIGHTS = 8;
const MAX_FACES_PER_IMAGE = Number(env.REKOGNITION_MAX_FACES_PER_IMAGE ?? 15);
const AUTO_APPLY_THRESHOLD = Number(env.REKOGNITION_AUTO_APPLY_THRESHOLD ?? 97);
const SUGGEST_THRESHOLD = Number(env.REKOGNITION_SUGGEST_THRESHOLD ?? 80);
const BOX_PADDING_RATIO = 0.35;
const MIN_LAST_NAME_LENGTH = 3;

const rekognition = new RekognitionClient({
  region: env.AWS_REKOGNITION_REGION,
  credentials: {
    accessKeyId: env.AWS_REKOGNITION_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_REKOGNITION_SECRET_ACCESS_KEY,
  },
});

const s3 = new S3Client({
  region: env.WASABI_REGION,
  endpoint: env.WASABI_ENDPOINT,
  credentials: { accessKeyId: env.WASABI_ACCESS_KEY_ID, secretAccessKey: env.WASABI_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

async function fetchImageBytes(objectKey) {
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.WASABI_BUCKET, Key: objectKey }), { expiresIn: 300 });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wasabi download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function detectFaces(bytes) {
  const res = await rekognition.send(new DetectFacesCommand({ Image: { Bytes: bytes } }));
  return (res.FaceDetails ?? [])
    .filter((f) => (f.Confidence ?? 0) >= DETECT_FACE_MIN_CONFIDENCE && f.BoundingBox)
    .map((f) => ({ box: f.BoundingBox, confidence: f.Confidence }));
}

function largestFaces(faces) {
  return [...faces]
    .sort((a, b) => (b.box.Width * b.box.Height) - (a.box.Width * a.box.Height))
    .slice(0, MAX_FACES_PER_IMAGE);
}

async function cropFace(imageBuffer, box) {
  const meta = await sharp(imageBuffer).metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;

  const boxW = box.Width * imgW;
  const boxH = box.Height * imgH;
  const padX = boxW * BOX_PADDING_RATIO;
  const padY = boxH * BOX_PADDING_RATIO;

  const left = Math.max(0, Math.round(box.Left * imgW - padX));
  const top = Math.max(0, Math.round(box.Top * imgH - padY));
  const width = Math.min(imgW - left, Math.round(boxW + padX * 2));
  const height = Math.min(imgH - top, Math.round(boxH + padY * 2));

  return sharp(imageBuffer).extract({ left, top, width, height }).toBuffer();
}

async function searchFaces(bytes, faces) {
  if (faces.length === 0) return [];

  const CONCURRENCY = 5;
  const matches = [];

  for (let i = 0; i < faces.length; i += CONCURRENCY) {
    const chunk = faces.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (face) => {
      const crop = await cropFace(bytes, face.box);
      let res;
      try {
        res = await rekognition.send(new SearchFacesByImageCommand({
          CollectionId: collectionId,
          Image: { Bytes: crop },
          MaxFaces: 1,
          FaceMatchThreshold: SUGGEST_THRESHOLD,
        }));
      } catch (err) {
        if (err.name === 'InvalidParameterException') return null;
        throw err;
      }
      const best = res.FaceMatches?.[0];
      if (!best?.Face?.ExternalImageId || best.Similarity == null) return null;
      return { playerId: best.Face.ExternalImageId, similarityPct: best.Similarity };
    }));
    matches.push(...results.filter((r) => r !== null));
  }

  const byPlayer = new Map();
  for (const m of matches) {
    const existing = byPlayer.get(m.playerId);
    if (!existing || m.similarityPct > existing.similarityPct) byPlayer.set(m.playerId, m);
  }
  return [...byPlayer.values()];
}

function isNearAFace(textBox, faces) {
  return faces.some((f) => {
    const horizontalOverlap = textBox.Left < f.box.Left + f.box.Width && textBox.Left + textBox.Width > f.box.Left;
    const verticalReach = f.box.Height * JERSEY_VERTICAL_REACH_FACE_HEIGHTS;
    const positionedBelow = textBox.Top > f.box.Top && textBox.Top < f.box.Top + f.box.Height + verticalReach;
    return horizontalOverlap && positionedBelow;
  });
}

function lastName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function normalizeJerseyText(text) {
  return text.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

async function detectJerseyIdentifiers(bytes, faces, players) {
  const res = await rekognition.send(new DetectTextCommand({ Image: { Bytes: bytes } }));
  const detections = (res.TextDetections ?? [])
    .filter((t) => (t.Confidence ?? 0) >= DETECT_TEXT_MIN_CONFIDENCE && t.Geometry?.BoundingBox && t.DetectedText);

  if (detections.length === 0) return [];

  const numberCandidates = detections
    .filter((t) => t.Type === 'WORD')
    .map((t) => ({ number: parseInt(t.DetectedText.trim(), 10), box: t.Geometry.BoundingBox }))
    .filter((c) => !isNaN(c.number) && c.number >= 1 && c.number <= 99);

  const nameCandidates = detections
    .map((t) => ({ text: normalizeJerseyText(t.DetectedText), box: t.Geometry.BoundingBox }))
    .filter((c) => c.text.length >= MIN_LAST_NAME_LENGTH);

  if (numberCandidates.length === 0 && nameCandidates.length === 0) return [];
  if (players.length === 0) return [];

  const byPlayer = new Map();
  const matchedViaNumber = new Set();
  const matchedViaName = new Set();
  const consider = (playerId, grounded) => {
    const existing = byPlayer.get(playerId);
    if (!existing || (grounded && !existing.grounded)) byPlayer.set(playerId, { playerId, grounded });
  };

  for (const candidate of numberCandidates) {
    const player = players.find((p) => p.number === candidate.number);
    if (player) {
      matchedViaNumber.add(player.id);
      consider(player.id, isNearAFace(candidate.box, faces));
    }
  }

  const playersByLastName = new Map(players.map((p) => [normalizeJerseyText(lastName(p.name)), p]));
  for (const candidate of nameCandidates) {
    const player = playersByLastName.get(candidate.text);
    if (player) {
      matchedViaName.add(player.id);
      consider(player.id, isNearAFace(candidate.box, faces));
    }
  }

  for (const playerId of matchedViaNumber) {
    if (matchedViaName.has(playerId)) byPlayer.set(playerId, { playerId, grounded: true });
  }

  return [...byPlayer.values()];
}

async function identifyPlayersInImage(objectKey, players) {
  const raw = await fetchImageBytes(objectKey);
  const bytes = await sharp(raw).rotate().toBuffer();
  const faces = await detectFaces(bytes);

  const [faceMatches, jerseyMatches] = await Promise.all([
    searchFaces(bytes, largestFaces(faces)),
    detectJerseyIdentifiers(bytes, faces, players),
  ]);

  return { faceMatches, jerseyMatches };
}

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

async function upsertPlayerTag(assetId, playerId, source, confidence, status) {
  const existing = await db.execute({
    sql: `SELECT status FROM AssetPlayerTag WHERE assetId = ? AND playerId = ? AND source = ?`,
    args: [assetId, playerId, source],
  });
  if (existing.rows.length > 0 && existing.rows[0].status !== 'suggested') return;

  if (existing.rows.length > 0) {
    await db.execute({
      sql: `UPDATE AssetPlayerTag SET confidence = ?, status = ? WHERE assetId = ? AND playerId = ? AND source = ?`,
      args: [confidence, status, assetId, playerId, source],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO AssetPlayerTag (id, assetId, playerId, source, confidence, status, createdAt) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)`,
      args: [assetId, playerId, source, confidence, status, new Date().toISOString()],
    });
  }
}

async function addConfirmedStringTag(assetId, tag) {
  const { rows } = await db.execute({ sql: `SELECT detectedTagsJson FROM Asset WHERE id = ?`, args: [assetId] });
  const tags = rows[0]?.detectedTagsJson ? JSON.parse(rows[0].detectedTagsJson) : [];
  if (tags.includes(tag)) return;
  tags.push(tag);
  await db.execute({ sql: `UPDATE Asset SET detectedTagsJson = ? WHERE id = ?`, args: [JSON.stringify(tags), assetId] });
}

const players = (await db.execute(`SELECT id, name, number FROM Player WHERE active = 1`)).rows;

const { rows: assets } = await db.execute(
  `SELECT id, objectKey, faceTagAttempts FROM Asset WHERE faceTagStatus = 'pending' AND fileType LIKE 'image/%'`
);

console.log(`Processing ${assets.length} legacy assets...`);

const results = { done: 0, failed: 0 };

for (const asset of assets) {
  try {
    const { faceMatches, jerseyMatches } = await identifyPlayersInImage(asset.objectKey, players);

    for (const match of faceMatches) {
      const status = match.similarityPct >= AUTO_APPLY_THRESHOLD ? 'confirmed' : 'suggested';
      await upsertPlayerTag(asset.id, match.playerId, 'face', match.similarityPct / 100, status);
      if (status === 'confirmed') {
        const player = players.find((p) => p.id === match.playerId);
        if (player) await addConfirmedStringTag(asset.id, `player:${slugify(player.name)}`);
      }
    }
    for (const match of jerseyMatches) {
      const status = match.grounded ? 'confirmed' : 'suggested';
      await upsertPlayerTag(asset.id, match.playerId, 'jersey-ocr', null, status);
      if (status === 'confirmed') {
        const player = players.find((p) => p.id === match.playerId);
        if (player) await addConfirmedStringTag(asset.id, `player:${slugify(player.name)}`);
      }
    }

    await db.execute({ sql: `UPDATE Asset SET faceTagStatus = 'done' WHERE id = ?`, args: [asset.id] });
    console.log(`OK   ${asset.id} — ${faceMatches.length} face match(es), ${jerseyMatches.length} jersey match(es)`);
    results.done++;
  } catch (err) {
    console.error(`FAIL ${asset.id}: ${err.message}`);
    await db.execute({
      sql: `UPDATE Asset SET faceTagAttempts = faceTagAttempts + 1 WHERE id = ?`,
      args: [asset.id],
    });
    results.failed++;
  }
}

console.log(`\nDone: ${results.done}/${assets.length} processed, ${results.failed} failed.`);
