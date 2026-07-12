// One-time provisioning: creates the AWS Rekognition face collection used for player
// identification. Requires broader CreateCollection permission than the app's own runtime
// credentials need — run this once locally with an admin-scoped AWS credential, then scope
// the app's AWS_REKOGNITION_* env vars down to IndexFaces/DeleteFaces/SearchFacesByImage/
// DetectFaces/ListFaces on just this collection.
// Usage: node scripts/setup-rekognition-collection.mjs
import { RekognitionClient, CreateCollectionCommand, DescribeCollectionCommand } from '@aws-sdk/client-rekognition';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; })
);

const collectionId = env.REKOGNITION_COLLECTION_ID || 'sams-players';

const client = new RekognitionClient({
  region: env.AWS_REKOGNITION_REGION,
  credentials: {
    accessKeyId: env.AWS_REKOGNITION_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_REKOGNITION_SECRET_ACCESS_KEY,
  },
});

try {
  const res = await client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
  console.log(`Created collection "${collectionId}" (ARN: ${res.CollectionArn})`);
} catch (err) {
  if (err.name === 'ResourceAlreadyExistsException') {
    console.log(`Collection "${collectionId}" already exists.`);
  } else {
    throw err;
  }
}

const info = await client.send(new DescribeCollectionCommand({ CollectionId: collectionId }));
console.log(`Face count: ${info.FaceCount ?? 0}, created: ${info.CreationTimestamp}`);
