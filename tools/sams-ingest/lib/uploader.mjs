import { createHash } from 'node:crypto';
import { createReadStream, statSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { putToStorage } from './api.mjs';

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

      const { urls } = await api.getPartUrls(jobId, [partNumber]);
      const eTag = await putToStorage(urls[0].url, chunk, 'application/octet-stream');
      parts.push({ partNumber, eTag });
      onProgress?.(partNumber, partsTotal);
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

  if (session.mode === 'multipart') {
    const parts = await uploadMultipart(
      api, session.jobId, filePath, session.partSize, session.partsTotal,
      (done, total) => onProgress?.('uploading', { done, total }),
    );
    onProgress?.('finalizing');
    const result = await api.completeSession(session.jobId, { parts });
    return { status: 'ok', assetId: result.assetId };
  }

  const buffer = await import('node:fs/promises').then((fs) => fs.readFile(filePath));
  await putToStorage(session.presignedUrl, buffer, contentType);
  onProgress?.('finalizing');
  const result = await api.completeSession(session.jobId);
  return { status: 'ok', assetId: result.assetId };
}
