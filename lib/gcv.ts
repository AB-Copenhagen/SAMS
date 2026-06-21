// Google Cloud Vision REST client
//
// Auth: service account JSON stored in GOOGLE_CLOUD_CREDENTIALS_JSON env var.
// Uses google-auth-library to obtain OAuth2 bearer tokens — no gRPC, works on Vercel.
//
// Image source: downloads from Wasabi via presigned URL, sends as inline base64.
// Limit: skips files larger than 10 MB (Vision API inline limit).

import { GoogleAuth } from 'google-auth-library';
import { getPresignedUrl } from './wasabi';

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const MAX_BYTES   = 10 * 1024 * 1024; // 10 MB inline limit

let _auth: GoogleAuth | undefined;

function getAuth(): GoogleAuth {
  if (!_auth) {
    const raw = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
    if (!raw) throw new Error('Missing GOOGLE_CLOUD_CREDENTIALS_JSON env var');
    _auth = new GoogleAuth({
      credentials: JSON.parse(raw) as Record<string, string>,
      scopes: ['https://www.googleapis.com/auth/cloud-vision'],
    });
  }
  return _auth;
}

// ── Response types ────────────────────────────────────────────────────────────

export interface GcvLabel {
  description: string;
  score: number;
}

export interface GcvObject {
  name: string;
  score: number;
}

export interface GcvLogo {
  description: string;
  score: number;
}

export interface GcvFace {
  detectionConfidence: number;
}

export interface GcvResult {
  labels:  GcvLabel[];
  objects: GcvObject[];
  logos:   GcvLogo[];
  faces:   GcvFace[];
  /** Raw OCR text extracted from the image (all blocks joined). */
  text:    string;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeWithGcv(objectKey: string): Promise<GcvResult> {
  // 1. Download image from Wasabi
  const url   = await getPresignedUrl(objectKey);
  const dlRes = await fetch(url);
  if (!dlRes.ok) throw new Error(`Wasabi download failed: ${dlRes.status}`);

  const buffer = Buffer.from(await dlRes.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`Image too large for inline Vision API (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB > 10 MB)`);
  }

  const base64 = buffer.toString('base64');

  // 2. Get OAuth2 access token
  const token = await getAuth().getAccessToken();
  if (!token) throw new Error('Failed to obtain GCV access token');

  // 3. Call Vision REST API
  const body = {
    requests: [{
      image: { content: base64 },
      features: [
        { type: 'LABEL_DETECTION',      maxResults: 20 },
        { type: 'OBJECT_LOCALIZATION',  maxResults: 20 },
        { type: 'TEXT_DETECTION' },
        { type: 'LOGO_DETECTION',       maxResults: 15 },
        { type: 'FACE_DETECTION',       maxResults: 20 },
      ],
    }],
  };

  const res = await fetch(VISION_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Vision API error ${res.status}: ${text}`);
  }

  const json = await res.json() as {
    responses: Array<{
      labelAnnotations?:          Array<{ description: string; score: number }>;
      localizedObjectAnnotations?: Array<{ name: string; score: number }>;
      logoAnnotations?:           Array<{ description: string; score: number }>;
      faceAnnotations?:           Array<{ detectionConfidence: number }>;
      textAnnotations?:           Array<{ description: string }>;
      error?:                     { message: string };
    }>;
  };

  const response = json.responses?.[0];
  if (!response) throw new Error('Empty Vision API response');
  if (response.error) throw new Error(`Vision API: ${response.error.message}`);

  // textAnnotations[0].description is the full concatenated text
  const text = response.textAnnotations?.[0]?.description ?? '';

  return {
    labels:  (response.labelAnnotations          ?? []).map((l) => ({ description: l.description, score: l.score })),
    objects: (response.localizedObjectAnnotations ?? []).map((o) => ({ name: o.name, score: o.score })),
    logos:   (response.logoAnnotations           ?? []).map((l) => ({ description: l.description, score: l.score })),
    faces:   (response.faceAnnotations           ?? []).map((f) => ({ detectionConfidence: f.detectionConfidence })),
    text,
  };
}
