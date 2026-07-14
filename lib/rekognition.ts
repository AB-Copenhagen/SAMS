// AWS Rekognition — player face identification
//
// Enrolls each Player's headshot into a small private "collection" (IndexFaces), then
// searches new photos against it (DetectFaces + SearchFacesByImage per detected face).
// Rekognition's SearchFacesByImage only matches the single LARGEST face in a query image —
// it is not "find everyone in this photo" — so multi-person photos require detecting every
// face first and searching each crop individually. See the plan doc for the cost rationale.

import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  DeleteFacesCommand,
  DetectFacesCommand,
  SearchFacesByImageCommand,
  DetectTextCommand,
  type BoundingBox,
} from '@aws-sdk/client-rekognition';
import sharp from 'sharp';
import type { PrismaClient } from '@prisma/client';
import { getPresignedUrl } from './wasabi';
import { prisma } from './db';

let _client: RekognitionClient | undefined;

function getClient(): RekognitionClient {
  if (!_client) {
    const region          = process.env.AWS_REKOGNITION_REGION;
    const accessKeyId     = process.env.AWS_REKOGNITION_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_REKOGNITION_SECRET_ACCESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('Missing AWS_REKOGNITION_REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY env vars');
    }

    _client = new RekognitionClient({ region, credentials: { accessKeyId, secretAccessKey } });
  }
  return _client;
}

function getCollectionId(): string {
  return process.env.REKOGNITION_COLLECTION_ID ?? 'sams-players';
}

const DETECT_FACE_MIN_CONFIDENCE = 90;
const DETECT_TEXT_MIN_CONFIDENCE = 80;
// A jersey number sits on the torso, below the face — "near" is defined loosely as horizontally
// overlapping the face and within a handful of face-heights below it, to tolerate the wide range
// of framing (tight headshot-style crop vs. full-body action shot) real match photos come in.
const JERSEY_VERTICAL_REACH_FACE_HEIGHTS = 8;
const MAX_FACES_PER_IMAGE        = Number(process.env.REKOGNITION_MAX_FACES_PER_IMAGE ?? 15);
export const SUGGEST_THRESHOLD    = Number(process.env.REKOGNITION_SUGGEST_THRESHOLD ?? 80);

const BOX_PADDING_RATIO = 0.35; // pad each detected face crop for better match accuracy

export async function ensureCollection(): Promise<void> {
  try {
    await getClient().send(new CreateCollectionCommand({ CollectionId: getCollectionId() }));
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name !== 'ResourceAlreadyExistsException') throw err;
  }
}

async function fetchImageBytes(objectKey: string): Promise<Buffer> {
  const url = await getPresignedUrl(objectKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wasabi download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface EnrollResult {
  faceId: string;
}

export async function enrollPlayerFace(headshotUrlOrObjectKey: string, playerId: string): Promise<EnrollResult> {
  const bytes = headshotUrlOrObjectKey.startsWith('http')
    ? Buffer.from(await (await fetch(headshotUrlOrObjectKey)).arrayBuffer())
    : await fetchImageBytes(headshotUrlOrObjectKey);

  const res = await getClient().send(new IndexFacesCommand({
    CollectionId: getCollectionId(),
    Image: { Bytes: bytes },
    ExternalImageId: playerId,
    MaxFaces: 1,
    QualityFilter: 'AUTO',
    DetectionAttributes: [],
  }));

  const records = res.FaceRecords ?? [];
  if (records.length === 0) {
    throw new Error('No face detected in headshot — use a clearer, front-facing photo');
  }
  if ((res.FaceRecords?.length ?? 0) > 1) {
    throw new Error('Multiple faces detected in headshot — use a single-subject photo');
  }

  const faceId = records[0]?.Face?.FaceId;
  if (!faceId) throw new Error('Rekognition did not return a FaceId');
  return { faceId };
}

export async function deletePlayerFace(faceId: string): Promise<void> {
  await getClient().send(new DeleteFacesCommand({ CollectionId: getCollectionId(), FaceIds: [faceId] }));
}

interface DetectedFace {
  box: BoundingBox;
  confidence: number;
}

// Returns EVERY detected face — deliberately uncapped. DetectFaces is a single flat-rate call
// regardless of how many faces come back, so there's no cost reason to truncate this list; only
// the per-face SearchFacesByImage step below is expensive enough to need a cap. Jersey-text
// grounding (isNearAFace) uses this full list — capping it here previously meant a real match
// on a dense crowd/team photo could get discarded before grounding was even checked, just because
// the relevant face wasn't among the largest N in frame.
async function detectFaces(bytes: Buffer): Promise<DetectedFace[]> {
  const res = await getClient().send(new DetectFacesCommand({ Image: { Bytes: bytes } }));
  return (res.FaceDetails ?? [])
    .filter((f) => (f.Confidence ?? 0) >= DETECT_FACE_MIN_CONFIDENCE && f.BoundingBox)
    .map((f) => ({ box: f.BoundingBox!, confidence: f.Confidence! }));
}

// Largest-area faces first, capped — this is what actually costs money (one SearchFacesByImage
// call per face), so it stays capped even though grounding checks now see every face.
function largestFaces(faces: DetectedFace[]): DetectedFace[] {
  return [...faces]
    .sort((a, b) => (b.box.Width! * b.box.Height!) - (a.box.Width! * a.box.Height!))
    .slice(0, MAX_FACES_PER_IMAGE);
}

async function cropFace(imageBuffer: Buffer, box: BoundingBox): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;

  const boxW = box.Width! * imgW;
  const boxH = box.Height! * imgH;
  const padX = boxW * BOX_PADDING_RATIO;
  const padY = boxH * BOX_PADDING_RATIO;

  const left   = Math.max(0, Math.round(box.Left! * imgW - padX));
  const top    = Math.max(0, Math.round(box.Top!  * imgH - padY));
  const width  = Math.min(imgW - left, Math.round(boxW + padX * 2));
  const height = Math.min(imgH - top,  Math.round(boxH + padY * 2));

  return sharp(imageBuffer).extract({ left, top, width, height }).toBuffer();
}

export interface FaceMatch {
  playerId: string;
  similarityPct: number;
}

async function searchFaces(bytes: Buffer, faces: DetectedFace[]): Promise<FaceMatch[]> {
  if (faces.length === 0) return [];

  const CONCURRENCY = 5;
  const matches: FaceMatch[] = [];

  for (let i = 0; i < faces.length; i += CONCURRENCY) {
    const chunk = faces.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (face) => {
      const crop = await cropFace(bytes, face.box);
      let res;
      try {
        res = await getClient().send(new SearchFacesByImageCommand({
          CollectionId: getCollectionId(),
          Image: { Bytes: crop },
          MaxFaces: 1,
          FaceMatchThreshold: SUGGEST_THRESHOLD,
        }));
      } catch (err) {
        // A crop that DetectFaces flagged as a face can still fail Rekognition's stricter
        // in-crop re-detection (tight/angled/motion-blurred padding) — that's just "no match
        // for this face", not a reason to abort every other face (and jersey-OCR) in the image.
        if ((err as { name?: string }).name === 'InvalidParameterException') return null;
        throw err;
      }
      const best = res.FaceMatches?.[0];
      if (!best?.Face?.ExternalImageId || best.Similarity == null) return null;
      return { playerId: best.Face.ExternalImageId, similarityPct: best.Similarity };
    }));
    matches.push(...results.filter((r): r is FaceMatch => r !== null));
  }

  // Dedupe: if two overlapping crops matched the same player, keep the higher-confidence one.
  const byPlayer = new Map<string, FaceMatch>();
  for (const m of matches) {
    const existing = byPlayer.get(m.playerId);
    if (!existing || m.similarityPct > existing.similarityPct) byPlayer.set(m.playerId, m);
  }
  return [...byPlayer.values()];
}

export interface JerseyMatch {
  playerId: string;
  /** true = the number sits near a detected person, so it's trustworthy enough to auto-confirm;
   *  false = no nearby person (likely a scoreboard/stadium digit) — surface as 'suggested' only. */
  grounded: boolean;
}

function isNearAFace(textBox: BoundingBox, faces: DetectedFace[]): boolean {
  return faces.some((f) => {
    const horizontalOverlap = textBox.Left! < f.box.Left! + f.box.Width! && textBox.Left! + textBox.Width! > f.box.Left!;
    const verticalReach = f.box.Height! * JERSEY_VERTICAL_REACH_FACE_HEIGHTS;
    const positionedBelow = textBox.Top! > f.box.Top! && textBox.Top! < f.box.Top! + f.box.Height! + verticalReach;
    return horizontalOverlap && positionedBelow;
  });
}

const MIN_LAST_NAME_LENGTH = 3; // avoid short/generic-word false positives, same rationale as sponsor aliases

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function normalizeJerseyText(text: string): string {
  return text.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

export interface JerseyDetectionResult {
  matches: JerseyMatch[];
  /** Every LINE-level text detection (jersey text, crest text, sponsor boards, etc.) — a free
   *  byproduct of the same DetectText call, reused for sponsor OCR matching so it costs nothing
   *  extra. */
  lines: string[];
}

// Reads BOTH the jersey number and the printed surname off the back of a shirt from one
// DetectText call — same detections, two independent ways to land on the same player, each
// spatially grounded against a detected person the same way. Also surfaces every detected text
// line so callers can run sponsor OCR matching against it without a second Rekognition call.
async function detectJerseyIdentifiers(bytes: Buffer, faces: DetectedFace[], db: PrismaClient): Promise<JerseyDetectionResult> {
  const res = await getClient().send(new DetectTextCommand({ Image: { Bytes: bytes } }));
  const detections = (res.TextDetections ?? [])
    .filter((t) => (t.Confidence ?? 0) >= DETECT_TEXT_MIN_CONFIDENCE && t.Geometry?.BoundingBox && t.DetectedText);

  const lines = detections.filter((t) => t.Type === 'LINE').map((t) => t.DetectedText!);

  if (detections.length === 0) return { matches: [], lines };

  const numberCandidates = detections
    .filter((t) => t.Type === 'WORD')
    .map((t) => ({ number: parseInt(t.DetectedText!.trim(), 10), box: t.Geometry!.BoundingBox! }))
    .filter((c) => !isNaN(c.number) && c.number >= 1 && c.number <= 99);

  const nameCandidates = detections
    // Surnames are usually one word, but Rekognition sometimes splits/joins differently, so
    // check both WORD and LINE detections against the same normalized last name.
    .map((t) => ({ text: normalizeJerseyText(t.DetectedText!), box: t.Geometry!.BoundingBox! }))
    .filter((c) => c.text.length >= MIN_LAST_NAME_LENGTH);

  if (numberCandidates.length === 0 && nameCandidates.length === 0) return { matches: [], lines };

  const players = await db.player.findMany({ where: { active: true }, select: { id: true, name: true, number: true } });
  if (players.length === 0) return { matches: [], lines };

  const byPlayer = new Map<string, JerseyMatch>();
  const matchedViaNumber = new Set<string>();
  const matchedViaName = new Set<string>();
  const consider = (playerId: string, grounded: boolean) => {
    const existing = byPlayer.get(playerId);
    // A grounded sighting anywhere in the image is enough to trust the player is really present,
    // even if the same identifier also appears elsewhere (e.g. an ungrounded scoreboard digit).
    if (!existing || (grounded && !existing.grounded)) byPlayer.set(playerId, { playerId, grounded });
  };

  for (const candidate of numberCandidates) {
    const player = players.find((p) => p.number === candidate.number);
    if (player) {
      matchedViaNumber.add(player.id);
      consider(player.id, isNearAFace(candidate.box, faces));
    }
  }

  const playersByLastName = new Map(players.map((p) => [normalizeJerseyText(lastName(p.name)), p] as const));
  for (const candidate of nameCandidates) {
    const player = playersByLastName.get(candidate.text);
    if (player) {
      matchedViaName.add(player.id);
      consider(player.id, isNearAFace(candidate.box, faces));
    }
  }

  // Two independent OCR reads (the jersey number AND the printed surname) agreeing on the same
  // player is trustworthy on its own — no scoreboard/signage would coincidentally show both a
  // specific player's exact number and exact surname together — so this auto-confirms even
  // without a detected face nearby (real photos often catch a clear number/name on someone whose
  // face isn't reliably detected: turned away, distant, motion-blurred, etc).
  for (const playerId of matchedViaNumber) {
    if (matchedViaName.has(playerId)) byPlayer.set(playerId, { playerId, grounded: true });
  }

  return { matches: [...byPlayer.values()], lines };
}

export interface IdentifyPlayersResult {
  faceMatches: FaceMatch[];
  jerseyMatches: JerseyMatch[];
  detectedLines: string[];
}

// db defaults to the shared singleton for normal (short-lived, request-scoped) callers; long-lived
// pollers like the ingest cron should pass in their own disposable client — see createPrismaClient
// in lib/db.ts for why.
export async function identifyPlayersInImage(objectKey: string, db: PrismaClient = prisma): Promise<IdentifyPlayersResult> {
  const raw = await fetchImageBytes(objectKey);
  // Rekognition's bounding boxes are relative to the EXIF-corrected orientation of the image.
  // Bake that rotation into the buffer up front (and strip the EXIF tag) so sharp's pixel math
  // in cropFace() lines up with Rekognition's coordinates — otherwise a rotated photo (extremely
  // common from phones/cameras) produces a crop that doesn't actually contain the detected face.
  const bytes = await sharp(raw).rotate().toBuffer();
  const faces = await detectFaces(bytes);

  const [faceMatches, jerseyResult] = await Promise.all([
    searchFaces(bytes, largestFaces(faces)),
    detectJerseyIdentifiers(bytes, faces, db),
  ]);

  return { faceMatches, jerseyMatches: jerseyResult.matches, detectedLines: jerseyResult.lines };
}
