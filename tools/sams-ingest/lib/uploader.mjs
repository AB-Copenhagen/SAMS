import { createHash } from 'node:crypto';
import { createReadStream, statSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { putToStorage } from './api.mjs';

const MAX_ATTEMPTS = 5; // per part — backoff of ~1s, 2s, 4s, 8s between attempts
const RETRY_BASE_DELAY_MS = 1000;
const PROGRESS_REPORT_EVERY_PARTS = 10;

// Network errors carry no status (fetch rejects); 403 from storage means the presigned URL
// expired, which the next attempt fixes by presigning again.
function isRetryable(err) {
  if (err.status == null) return true;
  return err.status >= 500 || err.status === 408 || err.status === 429
    || (err.source === 'storage' && err.status === 403);
}

async function withRetry(label, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isRetryable(err)) {
        throw new Error(`${label} failed after ${attempt} attempt${attempt === 1 ? '' : 's'}: ${err.message}`);
      }
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function uploadMultipart(api, jobId, filePath, partSize, partsTotal, onProgress) {
  const fd = openSync(filePath, 'r');
  const buffer = Buffer.alloc(partSize);
  const parts = [];

  try {
    for (let partNumber = 1; partNumber <= partsTotal; partNumber++) {
      const offset = (partNumber - 1) * partSize;
      const bytesRead = readSync(fd, buffer, 0, partSize, offset);
      const chunk = bytesRead === partSize ? buffer : buffer.subarray(0, bytesRead);

      // Presigned just in time, so a retry also gets a fresh URL if the last one expired.
      const eTag = await withRetry(`Part ${partNumber} of ${partsTotal}`, async () => {
        const { urls } = await api.getPartUrls(jobId, [partNumber]);
        return putToStorage(urls[0].url, chunk, 'application/octet-stream');
      });
      parts.push({ partNumber, eTag });
      onProgress?.(partNumber, partsTotal);
      if (partNumber % PROGRESS_REPORT_EVERY_PARTS === 0) {
        api.reportProgress(jobId, partNumber).catch(() => {}); // display-only, never fatal
      }
    }
  } finally {
    closeSync(fd);
  }

  return parts;
}

/**
 * Ingests one file end-to-end: pre-transfer dedup check, single-shot or multipart
 * upload, then confirm. Returns { status: 'duplicate', existingAssetId } or
 * { status: 'ok', assetId }.
 */
export async function ingestOneFile(api, filePath, { channel, metadata }, onProgress) {
  const stat = statSync(filePath);
  const fileName = path.basename(filePath);
  const contentType = (await import('./mime.mjs')).guessContentType(filePath);
  if (!contentType) throw new Error(`Unsupported file type: ${fileName}`);

  onProgress?.('hashing');
  const contentHash = await sha256File(filePath);

  const session = await api.createSession({
    fileName, fileType: contentType, fileSize: stat.size, contentHash, channel, metadata,
  });

  if (session.status === 'duplicate') {
    return { status: 'duplicate', existingAssetId: session.existingAssetId };
  }

  onProgress?.('uploading');

  // A transfer that gives up marks its job failed (best-effort) so it doesn't sit in Live ingest
  // as "in progress" until the cron sweep. Once completeSession is called the server owns status.
  let parts;
  try {
    if (session.mode === 'multipart') {
      parts = await uploadMultipart(
        api, session.jobId, filePath, session.partSize, session.partsTotal,
        (done, total) => onProgress?.('uploading', { done, total }),
      );
    } else {
      const buffer = await import('node:fs/promises').then((fs) => fs.readFile(filePath));
      await withRetry('Upload', () => putToStorage(session.presignedUrl, buffer, contentType));
    }
  } catch (err) {
    await api.abortSession(session.jobId, err.message).catch(() => {});
    throw err;
  }

  onProgress?.('finalizing');
  const result = await api.completeSession(session.jobId, parts ? { parts } : undefined);
  return { status: 'ok', assetId: result.assetId };
}
