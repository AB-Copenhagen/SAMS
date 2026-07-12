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
  type BoundingBox,
} from '@aws-sdk/client-rekognition';
import sharp from 'sharp';
import { getPresignedUrl } from './wasabi';

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
const MAX_FACES_PER_IMAGE        = Number(process.env.REKOGNITION_MAX_FACES_PER_IMAGE ?? 15);
export const AUTO_APPLY_THRESHOLD = Number(process.env.REKOGNITION_AUTO_APPLY_THRESHOLD ?? 97);
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

export async function enrollPlayerFace(headshotUrlOrObjectKey: string): Promise<EnrollResult> {
  const bytes = headshotUrlOrObjectKey.startsWith('http')
    ? Buffer.from(await (await fetch(headshotUrlOrObjectKey)).arrayBuffer())
    : await fetchImageBytes(headshotUrlOrObjectKey);

  const res = await getClient().send(new IndexFacesCommand({
    CollectionId: getCollectionId(),
    Image: { Bytes: bytes },
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

async function detectFaces(bytes: Buffer): Promise<DetectedFace[]> {
  const res = await getClient().send(new DetectFacesCommand({ Image: { Bytes: bytes } }));
  return (res.FaceDetails ?? [])
    .filter((f) => (f.Confidence ?? 0) >= DETECT_FACE_MIN_CONFIDENCE && f.BoundingBox)
    .map((f) => ({ box: f.BoundingBox!, confidence: f.Confidence! }))
    // Largest-area faces first — caps to the most visually significant subjects in a crowd shot.
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

export async function searchFacesInImage(objectKey: string): Promise<FaceMatch[]> {
  const raw = await fetchImageBytes(objectKey);
  // Rekognition's bounding boxes are relative to the EXIF-corrected orientation of the image.
  // Bake that rotation into the buffer up front (and strip the EXIF tag) so sharp's pixel math
  // in cropFace() lines up with Rekognition's coordinates — otherwise a rotated photo (extremely
  // common from phones/cameras) produces a crop that doesn't actually contain the detected face.
  const bytes = await sharp(raw).rotate().toBuffer();
  const faces = await detectFaces(bytes);
  if (faces.length === 0) return [];

  const CONCURRENCY = 5;
  const matches: FaceMatch[] = [];

  for (let i = 0; i < faces.length; i += CONCURRENCY) {
    const chunk = faces.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (face) => {
      const crop = await cropFace(bytes, face.box);
      const res = await getClient().send(new SearchFacesByImageCommand({
        CollectionId: getCollectionId(),
        Image: { Bytes: crop },
        MaxFaces: 1,
        FaceMatchThreshold: SUGGEST_THRESHOLD,
      }));
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
