// Wasabi AiR — REST API adapter
//
// Fill in WASABI_AIR_API_URL and WASABI_AIR_API_KEY from your Wasabi console
// once you have AIR access. The shapes below match the documented AIR API.

export type AirAnalysis =
  | 'face_detection'
  | 'logo_detection'
  | 'object_detection'
  | 'scene_description'
  | 'ocr'
  | 'person_detection';

export type AirJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface AirFace {
  confidence: number;
  bounding_box?: { top: number; left: number; width: number; height: number };
}

export interface AirLogo {
  name: string;
  confidence: number;
}

export interface AirObject {
  name: string;
  confidence: number;
}

export interface AirPerson {
  confidence: number;
  count?: number;
}

export interface AirResult {
  faces?: AirFace[];
  logos?: AirLogo[];
  objects?: AirObject[];
  persons?: AirPerson[];
  description?: string;
  text?: string[];
}

export interface AirJobResponse {
  id: string;
  status: AirJobStatus;
  result?: AirResult;
  error?: string;
}

function getConfig() {
  const url    = process.env.WASABI_AIR_API_URL;
  const apiKey = process.env.WASABI_AIR_API_KEY;
  const bucket = process.env.WASABI_BUCKET;
  if (!url || !apiKey || !bucket) {
    throw new Error('Missing WASABI_AIR_API_URL, WASABI_AIR_API_KEY, or WASABI_BUCKET env vars');
  }
  return { url, apiKey, bucket };
}

export async function submitAirJob(
  objectKey: string,
  analyses: AirAnalysis[] = ['face_detection', 'logo_detection', 'object_detection', 'scene_description', 'ocr', 'person_detection'],
): Promise<string> {
  const { url, apiKey, bucket } = getConfig();

  const res = await fetch(`${url}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: { bucket, key: objectKey },
      analyses,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AIR job submission failed ${res.status}: ${text}`);
  }

  const data = await res.json() as { id: string };
  return data.id;
}

export async function getAirJob(jobId: string): Promise<AirJobResponse> {
  const { url, apiKey } = getConfig();

  const res = await fetch(`${url}/jobs/${jobId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AIR job fetch failed ${res.status}: ${text}`);
  }

  return res.json() as Promise<AirJobResponse>;
}
