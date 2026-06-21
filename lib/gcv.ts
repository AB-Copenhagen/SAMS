// Google Cloud Vision REST client
//
// Auth priority (first match wins):
//   1. GOOGLE_CLOUD_CREDENTIALS_JSON set  → service account JSON (legacy / allowed orgs)
//   2. GCP_WIF_AUDIENCE set               → Workload Identity Federation via Vercel OIDC
//        + GCP_SERVICE_ACCOUNT_EMAIL set  → also impersonates a keyless service account
//   3. Neither                            → Application Default Credentials (local dev)
//                                           Run: gcloud auth application-default login
//
// Image source: downloads from Wasabi via presigned URL, sends as inline base64.
// Limit: skips files larger than 10 MB (Vision API inline limit).

import { GoogleAuth } from 'google-auth-library';
import { getPresignedUrl } from './wasabi';

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const STS_URL    = 'https://sts.googleapis.com/v1/token';
const MAX_BYTES  = 10 * 1024 * 1024;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  // Path 1: service account JSON
  const credsJson = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
  if (credsJson) {
    const auth = new GoogleAuth({
      credentials: JSON.parse(credsJson) as Record<string, string>,
      scopes: ['https://www.googleapis.com/auth/cloud-vision'],
    });
    const token = await auth.getAccessToken();
    if (!token) throw new Error('Failed to get access token from GOOGLE_CLOUD_CREDENTIALS_JSON');
    return token;
  }

  // Path 2: Workload Identity Federation via Vercel OIDC
  const wifAudience = process.env.GCP_WIF_AUDIENCE;
  if (wifAudience) {
    return getWifToken(wifAudience);
  }

  // Path 3: Application Default Credentials (local: gcloud auth application-default login)
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-vision'],
  });
  const token = await auth.getAccessToken();
  if (!token) {
    throw new Error(
      'No GCP credentials found. For local dev run: ' +
      'gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-vision',
    );
  }
  return token;
}

async function getWifToken(audience: string): Promise<string> {
  // 1. Get Vercel's OIDC token (only available at runtime on Vercel)
  const { getVercelOidcToken } = await import('@vercel/oidc');
  const oidcToken = await getVercelOidcToken();

  // 2. Exchange via GCP STS for a short-lived federated access token
  const stsRes = await fetch(STS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:           'urn:ietf:params:oauth:grant-type:token-exchange',
      audience,
      scope:                'https://www.googleapis.com/auth/cloud-vision',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_token_type:   'urn:ietf:params:oauth:token-type:id_token',
      subject_token:        oidcToken,
    }).toString(),
  });

  if (!stsRes.ok) {
    const text = await stsRes.text().catch(() => '');
    throw new Error(`WIF STS exchange failed ${stsRes.status}: ${text}`);
  }

  const stsBody = await stsRes.json() as { access_token?: string; error?: string };
  if (stsBody.error || !stsBody.access_token) {
    throw new Error(`STS error: ${stsBody.error ?? 'no access_token in response'}`);
  }
  const federatedToken = stsBody.access_token;

  // 3. Optionally impersonate a keyless service account for a first-party token
  const saEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  if (!saEmail) return federatedToken;

  const impRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:generateAccessToken`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${federatedToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        scope:    ['https://www.googleapis.com/auth/cloud-vision'],
        lifetime: '3600s',
      }),
    },
  );

  if (!impRes.ok) {
    const text = await impRes.text().catch(() => '');
    throw new Error(`SA impersonation failed ${impRes.status}: ${text}`);
  }

  const impBody = await impRes.json() as { accessToken?: string };
  if (!impBody.accessToken) throw new Error('SA impersonation returned no accessToken');
  return impBody.accessToken;
}

// ── Response types ────────────────────────────────────────────────────────────

export interface GcvLabel  { description: string; score: number }
export interface GcvObject { name: string;        score: number }
export interface GcvLogo   { description: string; score: number }
export interface GcvFace   { detectionConfidence: number }

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
  // Download image from Wasabi
  const url   = await getPresignedUrl(objectKey);
  const dlRes = await fetch(url);
  if (!dlRes.ok) throw new Error(`Wasabi download failed: ${dlRes.status}`);

  const buffer = Buffer.from(await dlRes.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(
      `Image too large for inline Vision API (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB > 10 MB)`,
    );
  }

  const base64 = buffer.toString('base64');
  const token  = await getAccessToken();

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
      labelAnnotations?:           Array<{ description: string; score: number }>;
      localizedObjectAnnotations?: Array<{ name: string; score: number }>;
      logoAnnotations?:            Array<{ description: string; score: number }>;
      faceAnnotations?:            Array<{ detectionConfidence: number }>;
      textAnnotations?:            Array<{ description: string }>;
      error?:                      { message: string };
    }>;
  };

  const response = json.responses?.[0];
  if (!response) throw new Error('Empty Vision API response');
  if (response.error) throw new Error(`Vision API: ${response.error.message}`);

  return {
    labels:  (response.labelAnnotations           ?? []).map((l) => ({ description: l.description, score: l.score })),
    objects: (response.localizedObjectAnnotations  ?? []).map((o) => ({ name: o.name, score: o.score })),
    logos:   (response.logoAnnotations            ?? []).map((l) => ({ description: l.description, score: l.score })),
    faces:   (response.faceAnnotations            ?? []).map((f) => ({ detectionConfidence: f.detectionConfidence })),
    text:    response.textAnnotations?.[0]?.description ?? '',
  };
}
