import { createHash, createHmac } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WasbaiTagResult = {
  detectedTags: string[];
  sponsorLogos: string[];
  people:       string[];
};

type AirLabel = { name: string; confidence: number };

type AirJob = {
  id:      string;
  status:  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  results?: {
    labels?:  AirLabel[];
    logos?:   AirLabel[];
    objects?: AirLabel[];
    scenes?:  AirLabel[];
    faces?:   unknown[];
    text?:    string[];
  };
  error?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const AIR_HOST    = 'air.wasabisys.com';
const AIR_BASE    = `https://${AIR_HOST}/api/v1`;
const AIR_REGION  = 'us-east-1';
const AIR_SERVICE = 'air';

const CONFIDENCE_THRESHOLD = 70;
const POLL_INTERVAL_MS     = 1_500;
const POLL_TIMEOUT_MS      = 10_000;

// ─── SigV4 signing ───────────────────────────────────────────────────────────

function sigv4Headers(
  method: string,
  path: string,
  body: string,
  accessKeyId: string,
  secretAccessKey: string,
): Record<string, string> {
  const now       = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzdate   = now.toISOString().replace(/[:-]/g, '').replace(/\.\d+/, '');
  const payHash   = createHash('sha256').update(body).digest('hex');

  const hdrs: Record<string, string> = {
    host:                   AIR_HOST,
    'x-amz-date':           amzdate,
    'x-amz-content-sha256': payHash,
    ...(body ? { 'content-type': 'application/json' } : {}),
  };

  const sortedKeys       = Object.keys(hdrs).sort();
  const canonicalHeaders = sortedKeys.map(k => `${k}:${hdrs[k]}`).join('\n') + '\n';
  const signedHeaders    = sortedKeys.join(';');

  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payHash].join('\n');
  const credScope        = `${datestamp}/${AIR_REGION}/${AIR_SERVICE}/aws4_request`;
  const toSign           = [
    'AWS4-HMAC-SHA256', amzdate, credScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const hmac    = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
  const sigKey  = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, datestamp), AIR_REGION), AIR_SERVICE), 'aws4_request');
  const sigHex  = createHmac('sha256', sigKey).update(toSign).digest('hex');

  return {
    ...hdrs,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sigHex}`,
  };
}

// ─── API calls ───────────────────────────────────────────────────────────────

async function createJob(
  bucket: string,
  objectKey: string,
  storageRegion: string,
  accessKeyId: string,
  secretAccessKey: string,
): Promise<AirJob | null> {
  const body = JSON.stringify({
    name:     `dam-${Date.now()}`,
    input:    { bucket, key: objectKey, region: storageRegion },
    services: ['label_detection', 'logo_detection', 'object_detection'],
  });

  const path    = '/api/v1/jobs';
  const headers = sigv4Headers('POST', path, body, accessKeyId, secretAccessKey);

  let res: Response;
  try {
    res = await fetch(`${AIR_BASE}/jobs`, {
      method:  'POST',
      headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) },
      body,
    });
  } catch (err) {
    console.error('[air] network error creating job:', err);
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`[air] create job failed HTTP ${res.status}:`, text.slice(0, 200));
    return null;
  }

  return (await res.json()) as AirJob;
}

async function pollJob(
  jobId: string,
  accessKeyId: string,
  secretAccessKey: string,
): Promise<AirJob | null> {
  const path  = `/api/v1/jobs/${jobId}`;
  const until = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < until) {
    const headers = sigv4Headers('GET', path, '', accessKeyId, secretAccessKey);

    let res: Response;
    try {
      res = await fetch(`${AIR_BASE}/jobs/${jobId}`, { method: 'GET', headers });
    } catch (err) {
      console.error('[air] network error polling job:', err);
      return null;
    }

    if (!res.ok) {
      console.warn(`[air] poll job ${jobId} failed HTTP ${res.status}`);
      return null;
    }

    const job = (await res.json()) as AirJob;
    if (job.status === 'COMPLETED' || job.status === 'FAILED') return job;

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.warn(`[air] job ${jobId} timed out after ${POLL_TIMEOUT_MS}ms — tags will be empty`);
  return null;
}

// ─── Result mapping ──────────────────────────────────────────────────────────

function toTagResult(job: AirJob | null): WasbaiTagResult {
  if (!job?.results) return { detectedTags: [], sponsorLogos: [], people: [] };

  const pick = (arr: AirLabel[] = []) =>
    arr.filter(l => l.confidence >= CONFIDENCE_THRESHOLD).map(l => l.name.toLowerCase());

  const detectedTags = [
    ...new Set([
      ...pick(job.results.labels  ?? []),
      ...pick(job.results.objects ?? []),
      ...pick(job.results.scenes  ?? []),
    ]),
  ];

  const sponsorLogos = [...new Set(pick(job.results.logos ?? []))];
  const people       = (job.results.faces?.length ?? 0) > 0 ? ['person'] : [];

  return { detectedTags, sponsorLogos, people };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function tagAssetWithWasbai(
  _assetUrl: string,
  metadata: Record<string, unknown>,
): Promise<WasbaiTagResult | null> {
  const accessKeyId     = process.env.WASABI_AIR_ACCESS_KEY_ID;
  const secretAccessKey = process.env.WASABI_AIR_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    // Not configured — skip silently
    return null;
  }

  const bucket    = process.env.WASABI_BUCKET;
  const region    = process.env.WASABI_REGION;
  const objectKey = metadata.objectKey as string | undefined;
  const fileType  = metadata.fileType  as string | undefined;

  if (!bucket || !region || !objectKey) {
    console.warn('[air] missing bucket/region/objectKey in metadata — skipping');
    return null;
  }

  // AIR supports video but jobs take much longer — only tag images for now
  if (fileType && !fileType.startsWith('image/')) {
    return null;
  }

  const job = await createJob(bucket, objectKey, region, accessKeyId, secretAccessKey);
  if (!job) return null;

  console.log('[air] job created:', job.id, 'for', objectKey);

  const completed = await pollJob(job.id, accessKeyId, secretAccessKey);
  const result    = toTagResult(completed);

  console.log('[air] result — tags:', result.detectedTags, 'logos:', result.sponsorLogos);
  return result;
}
