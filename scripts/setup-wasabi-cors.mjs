// Sets CORS on the Wasabi bucket so browsers can PUT directly via presigned URLs.
// Usage: node scripts/setup-wasabi-cors.mjs
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; })
);

const client = new S3Client({
  region:   env.WASABI_REGION,
  endpoint: env.WASABI_ENDPOINT,
  credentials: { accessKeyId: env.WASABI_ACCESS_KEY_ID, secretAccessKey: env.WASABI_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

const bucket = env.WASABI_BUCKET;

await client.send(new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: ['*'],
        AllowedMethods: ['PUT', 'GET', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders:  ['ETag'],
        MaxAgeSeconds:  3600,
      },
    ],
  },
}));

console.log(`CORS written to bucket: ${bucket}`);

// Read it back to confirm
const { CORSRules } = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
console.log('Active CORS rules:', JSON.stringify(CORSRules, null, 2));
