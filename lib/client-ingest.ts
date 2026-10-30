'use client';

// Browser-safe helpers shared by BulkUploadZone and the mobile ingest page.
// Talks to the generic /api/ingest/* API (session-cookie authenticated — no device token needed
// from a logged-in browser tab).

import { createSHA256 } from 'hash-wasm';

export interface IngestMetadata {
  eventName?: string;
  eventDate?: string;
  location?: string;
  manualTags?: string[];
  collectionId?: string | null;
  seasonId?: string | null;
}

export type IngestResult = { duplicate: true; existingAssetId: string } | { duplicate: false; assetId: string };

const HASH_CHUNK_SIZE = 16 * 1024 * 1024; // 16MB — read/hash in fixed chunks so a multi-GB file
                                           // is never held in memory as one ArrayBuffer.
const PART_UPLOAD_CONCURRENCY = 5;
const PART_URL_BATCH_SIZE = 50; // how many presigned part URLs to request per API call
// presignUploadPart (lib/wasabi.ts) signs part URLs for 600s. Re-presign a batch once it's this
// old instead of racing the expiry; a 403 from storage forces a re-presign regardless.
const PART_URL_MAX_AGE_MS = 8 * 60 * 1000;
const PART_PUT_TIMEOUT_MS = 2 * 60 * 1000; // an 8MB part that hasn't landed in 2 minutes is stalled
const MAX_ATTEMPTS = 5;                    // per part — backoff of ~1s, 2s, 4s, 8s between attempts
const RETRY_BASE_DELAY_MS = 1000;
const PROGRESS_REPORT_EVERY_PARTS = 10;
const PROGRESS_REPORT_EVERY_MS = 15_000;

class HttpError extends Error {
  constructor(readonly source: 'storage' | 'api', readonly status: number, message: string) {
    super(message);
  }
}

// A 3GB upload is hundreds of requests, so one dropped connection is routine, not exceptional.
// Retry what can heal on its own: network errors (fetch rejects with TypeError — the browser's
// "Failed to fetch"), stalled requests, throttling, 5xx, and a 403 from storage, which on a
// presigned URL means it expired (the caller re-presigns before the next attempt).
function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status >= 500 || err.status === 408 || err.status === 429
      || (err.source === 'storage' && err.status === 403);
  }
  if (err instanceof DOMException) return err.name === 'TimeoutError';
  return err instanceof TypeError;
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isRetryable(err)) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`${label} failed after ${attempt} attempt${attempt === 1 ? '' : 's'}: ${reason}`);
      }
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Web Crypto's SubtleCrypto.digest() is single-shot only (needs the whole input up front) —
// hash-wasm's incremental hasher lets us feed the file in fixed-size chunks instead of loading
// it entirely into memory just to compute contentHash.
async function sha256HexStreaming(file: File): Promise<string> {
  const hasher = await createSHA256();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_SIZE) {
    const chunk = await file.slice(offset, offset + HASH_CHUNK_SIZE).arrayBuffer();
    hasher.update(new Uint8Array(chunk));
  }
  return hasher.digest('hex');
}

async function putToStorage(url: string, body: BodyInit, contentType: string, timeoutMs?: number): Promise<string> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  if (!res.ok) throw new HttpError('storage', res.status, `Storage upload failed (HTTP ${res.status})`);
  return res.headers.get('etag')?.replace(/"/g, '') ?? '';
}

// Presigns part URLs one batch at a time as the upload reaches them, using the parts endpoint's
// ?partNumbers=1,2,3 batch support. Presigning every part up front meant that on a slow
// connection the tail of a multi-GB file started uploading after its URLs had expired.
class PartUrlCache {
  private batches = new Map<number, { fetchedAt: number; urls: Promise<Map<number, string>> }>();

  constructor(private jobId: string, private partsTotal: number) {}

  async get(partNumber: number): Promise<{ url: string; fetchedAt: number }> {
    const index = Math.floor((partNumber - 1) / PART_URL_BATCH_SIZE);
    let batch = this.batches.get(index);
    if (!batch || Date.now() - batch.fetchedAt > PART_URL_MAX_AGE_MS) {
      const fresh = { fetchedAt: Date.now(), urls: this.fetchBatch(index) };
      // Don't cache a failed fetch — the next attempt should ask again.
      fresh.urls.catch(() => { if (this.batches.get(index) === fresh) this.batches.delete(index); });
      this.batches.set(index, fresh);
      batch = fresh;
    }
    const url = (await batch.urls).get(partNumber);
    if (!url) throw new Error(`Missing presigned URL for part ${partNumber}`);
    return { url, fetchedAt: batch.fetchedAt };
  }

  // Called when a URL came back 403. Only drops the batch if it's the one that URL came from, so
  // several workers hitting the same expiry trigger one re-presign, not one each.
  expire(partNumber: number, fetchedAt: number): void {
    const index = Math.floor((partNumber - 1) / PART_URL_BATCH_SIZE);
    if (this.batches.get(index)?.fetchedAt === fetchedAt) this.batches.delete(index);
  }

  private async fetchBatch(index: number): Promise<Map<number, string>> {
    const first = index * PART_URL_BATCH_SIZE + 1;
    const last = Math.min(first + PART_URL_BATCH_SIZE - 1, this.partsTotal);
    const numbers = Array.from({ length: last - first + 1 }, (_, i) => first + i);

    const res = await fetch(`/api/ingest/sessions/${this.jobId}/parts?partNumbers=${numbers.join(',')}`);
    if (!res.ok) throw new HttpError('api', res.status, `Could not get upload URLs (HTTP ${res.status})`);
    const { urls } = await res.json() as { urls: { partNumber: number; url: string }[] };
    return new Map(urls.map((u) => [u.partNumber, u.url]));
  }
}

// Fire-and-forget: progress is display-only (Live ingest panel), never worth failing an upload over.
function reportProgress(jobId: string, partsCompleted: number): void {
  fetch(`/api/ingest/sessions/${jobId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partsCompleted }),
  }).catch(() => {});
}

// Uploads every part with bounded concurrency instead of one-at-a-time — the real memory win is
// slicing straight from the original File (a lazy Blob view, no JS-side copy) rather than from a
// whole-file ArrayBuffer held for the entire upload. Completion order doesn't matter: the server's
// completeMultipartUpload already sorts parts by partNumber.
async function uploadPartsConcurrently(
  file: File,
  jobId: string,
  partsTotal: number,
  partSize: number,
  onProgress?: (message: string) => void,
): Promise<{ partNumber: number; eTag: string }[]> {
  const urls = new PartUrlCache(jobId, partsTotal);
  const parts: { partNumber: number; eTag: string }[] = new Array(partsTotal);
  let nextPartNumber = 1;
  let completed = 0;
  let lastReportedParts = 0;
  let lastReportedAt = Date.now();
  let failed = false;

  async function uploadPart(partNumber: number): Promise<string> {
    const start = (partNumber - 1) * partSize;
    const chunk = file.slice(start, start + partSize);
    return withRetry(`Part ${partNumber} of ${partsTotal}`, async () => {
      const { url, fetchedAt } = await urls.get(partNumber);
      try {
        return await putToStorage(url, chunk, file.type, PART_PUT_TIMEOUT_MS);
      } catch (err) {
        if (err instanceof HttpError && err.status === 403) urls.expire(partNumber, fetchedAt);
        throw err;
      }
    });
  }

  async function worker() {
    // Stop picking up new parts once any part has failed for good — the upload is lost anyway.
    while (!failed) {
      const partNumber = nextPartNumber++;
      if (partNumber > partsTotal) return;

      try {
        parts[partNumber - 1] = { partNumber, eTag: await uploadPart(partNumber) };
      } catch (err) {
        failed = true;
        throw err;
      }
      completed++;
      onProgress?.(`Uploading parts (${completed}/${partsTotal})…`);

      if (completed - lastReportedParts >= PROGRESS_REPORT_EVERY_PARTS || Date.now() - lastReportedAt >= PROGRESS_REPORT_EVERY_MS) {
        lastReportedParts = completed;
        lastReportedAt = Date.now();
        reportProgress(jobId, completed);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PART_UPLOAD_CONCURRENCY, partsTotal) }, () => worker()),
  );
  return parts;
}

// Best-effort: marks the job failed (with the reason) and frees the multipart upload's stored
// parts, so a dead upload doesn't sit in Live ingest as "in progress" until the 6h cron sweep.
async function failSession(jobId: string, err: unknown): Promise<void> {
  await fetch(`/api/ingest/sessions/${jobId}/abort`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
  }).catch(() => {});
}

export async function uploadViaIngestApi(
  file: File,
  opts: { channel: 'browser' | 'mobile'; metadata?: IngestMetadata; exifJson?: string | null },
  onProgress?: (message: string) => void,
): Promise<IngestResult> {
  onProgress?.('Hashing…');
  const contentHash = await sha256HexStreaming(file);

  const sessionRes = await fetch('/api/ingest/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name, fileType: file.type, fileSize: file.size,
      contentHash, channel: opts.channel, metadata: opts.metadata,
    }),
  });
  if (!sessionRes.ok) {
    const body = await sessionRes.json().catch(() => ({}));
    throw new Error(body.message ?? `Could not start upload (HTTP ${sessionRes.status})`);
  }
  const session = await sessionRes.json();

  if (session.status === 'duplicate') {
    return { duplicate: true, existingAssetId: session.existingAssetId };
  }

  onProgress?.('Uploading…');

  // Only the transfer itself is covered by failSession — once /complete has been called the
  // server owns the job's status, and it may have finished even if the response was lost.
  let parts: { partNumber: number; eTag: string }[] | undefined;
  try {
    if (session.mode === 'multipart') {
      parts = await uploadPartsConcurrently(file, session.jobId, session.partsTotal, session.partSize, onProgress);
    } else {
      await withRetry('Upload', () => putToStorage(session.presignedUrl, file, file.type));
    }
  } catch (err) {
    await failSession(session.jobId, err);
    throw err;
  }

  onProgress?.('Saving…');
  const completeRes = await fetch(`/api/ingest/sessions/${session.jobId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parts ? { parts, exifJson: opts.exifJson ?? null } : { exifJson: opts.exifJson ?? null }),
  });
  if (!completeRes.ok) throw new Error('Failed to finalize upload');
  const result = await completeRes.json();
  return { duplicate: false, assetId: result.assetId };
}
