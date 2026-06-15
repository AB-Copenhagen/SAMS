import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

export async function getPresignedUrl(objectKey: string, expiresIn = 3600): Promise<string> {
  const { client, bucket } = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    { expiresIn }
  );
}
