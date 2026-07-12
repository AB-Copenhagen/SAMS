import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { redis } from './redis';

let _client: S3Client | undefined;
let _bucket = '';

function getClient() {
  if (!_client) {
    const region          = process.env.WASABI_REGION;
    const endpoint        = process.env.WASABI_ENDPOINT;
    const accessKeyId     = process.env.WASABI_ACCESS_KEY_ID;
    const secretAccessKey = process.env.WASABI_SECRET_ACCESS_KEY;
    _bucket = process.env.WASABI_BUCKET ?? '';

    if (!region || !endpoint || !_bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('Missing Wasabi environment variables');
    }

    _client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }
  return { client: _client, bucket: _bucket };
}

export async function uploadFileToWasabi(key: string, body: Uint8Array, contentType: string): Promise<string> {
  const { client, bucket } = getClient();
  const endpoint = process.env.WASABI_ENDPOINT!;

  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  } catch (err) {
    console.error('[wasabi] S3 PutObject error:', JSON.stringify(err, null, 2));
    throw err;
  }

  const host = endpoint.replace(/https?:\/\//, '').replace(/\/$/, '');
  return `https://${host}/${bucket}/${key}`;
}

export async function deleteFileFromWasabi(objectKey: string): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

const URL_TTL_S   = 86400;        // 24 h — how long the signed URL is valid
const CACHE_TTL_S = URL_TTL_S - 3600; // evict 1 h before expiry

const CACHE_PREFIX = 'presigned:';

export async function getPresignedUrl(objectKey: string): Promise<string> {
  const cacheKey = CACHE_PREFIX + objectKey;

  const cached = await redis.get<string>(cacheKey);
  if (cached) return cached;

  const { client, bucket } = getClient();
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    { expiresIn: URL_TTL_S },
  );

  await redis.set(cacheKey, url, { ex: CACHE_TTL_S });
  return url;
}

export async function getPresignedUploadUrl(objectKey: string, contentType: string, expiresIn = 300): Promise<string> {
  const { client, bucket } = getClient();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType }),
    { expiresIn }
  );
}

// --- Multipart upload (large/resumable transfers) ---

export const MULTIPART_MIN_PART_SIZE = 8 * 1024 * 1024;  // 8 MB
export const MULTIPART_THRESHOLD     = 64 * 1024 * 1024; // switch to multipart above this

export async function createMultipartUpload(objectKey: string, contentType: string): Promise<string> {
  const { client, bucket } = getClient();
  const res = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType }));
  if (!res.UploadId) throw new Error('Wasabi did not return an UploadId');
  return res.UploadId;
}

export async function presignUploadPart(objectKey: string, uploadId: string, partNumber: number, expiresIn = 300): Promise<string> {
  const { client, bucket } = getClient();
  return getSignedUrl(
    client,
    new UploadPartCommand({ Bucket: bucket, Key: objectKey, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn },
  );
}

export interface UploadedPart {
  partNumber: number;
  eTag: string;
}

export async function listParts(objectKey: string, uploadId: string): Promise<UploadedPart[]> {
  const { client, bucket } = getClient();
  const parts: UploadedPart[] = [];
  let partNumberMarker: string | undefined;

  do {
    const res = await client.send(new ListPartsCommand({
      Bucket: bucket,
      Key: objectKey,
      UploadId: uploadId,
      PartNumberMarker: partNumberMarker,
    }));
    for (const p of res.Parts ?? []) {
      if (p.PartNumber != null && p.ETag) parts.push({ partNumber: p.PartNumber, eTag: p.ETag });
    }
    partNumberMarker = res.IsTruncated ? res.NextPartNumberMarker : undefined;
  } while (partNumberMarker);

  return parts;
}

export async function completeMultipartUpload(objectKey: string, uploadId: string, parts: UploadedPart[]): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: objectKey,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((p) => ({ PartNumber: p.partNumber, ETag: p.eTag })),
    },
  }));
}

export async function abortMultipartUpload(objectKey: string, uploadId: string): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: objectKey, UploadId: uploadId }));
}

export function getPublicUrl(objectKey: string): string {
  const endpoint = process.env.WASABI_ENDPOINT!.replace(/\/$/, '');
  const bucket   = process.env.WASABI_BUCKET!;
  const host     = endpoint.replace(/https?:\/\//, '');
  return `https://${host}/${bucket}/${objectKey}`;
}
