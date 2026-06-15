import { NextResponse } from 'next/server';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { prisma } from '../../../lib/db';

const ENV_KEYS = [
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'WASABI_REGION',
  'WASABI_BUCKET',
  'WASABI_ENDPOINT',
  'WASABI_ACCESS_KEY_ID',
  'WASABI_SECRET_ACCESS_KEY',
  'NEXT_PUBLIC_DESCOPE_PROJECT_ID',
  'DESCOPE_SERVICE_ACCOUNT_KEY',
] as const;

export async function GET() {
  // 1. Environment variables — present/missing only, never the values
  const env: Record<string, 'set' | 'missing'> = {};
  for (const key of ENV_KEYS) {
    env[key] = process.env[key] ? 'set' : 'missing';
  }

  // 2. Database connectivity
  let database: { ok: boolean; latencyMs?: number; error?: string } = { ok: false };
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    database = { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    database = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 3. Wasabi storage connectivity
  let storage: { ok: boolean; latencyMs?: number; bucket?: string; error?: string } = { ok: false };
  const region    = process.env.WASABI_REGION;
  const endpoint  = process.env.WASABI_ENDPOINT;
  const accessKey = process.env.WASABI_ACCESS_KEY_ID;
  const secretKey = process.env.WASABI_SECRET_ACCESS_KEY;
  const bucket    = process.env.WASABI_BUCKET;

  if (region && endpoint && accessKey && secretKey && bucket) {
    try {
      const client = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: true,
      });
      const t0 = Date.now();
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      storage = { ok: true, latencyMs: Date.now() - t0, bucket };
    } catch (err) {
      storage = {
        ok: false,
        bucket,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    storage = { ok: false, error: 'Missing Wasabi environment variables' };
  }

  const allOk = database.ok && storage.ok && Object.values(env).every((v) => v === 'set');

  return NextResponse.json(
    { ok: allOk, env, database, storage },
    { status: allOk ? 200 : 503 }
  );
}
