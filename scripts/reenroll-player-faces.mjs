// One-time fix: existing enrolled faces were indexed WITHOUT ExternalImageId (a bug in
// lib/rekognition.ts's enrollPlayerFace, now fixed), so SearchFacesByImage could never map a
// match back to a playerId — face-based identification silently never worked. This deletes each
// player's existing indexed face and re-indexes their headshot with ExternalImageId set to the
// player's id.
// Usage: node scripts/reenroll-player-faces.mjs
import { RekognitionClient, DeleteFacesCommand, IndexFacesCommand } from '@aws-sdk/client-rekognition';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; })
);

const collectionId = env.REKOGNITION_COLLECTION_ID || 'sams-players';

const rekognition = new RekognitionClient({
  region: env.AWS_REKOGNITION_REGION,
  credentials: {
    accessKeyId: env.AWS_REKOGNITION_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_REKOGNITION_SECRET_ACCESS_KEY,
  },
});

const s3 = new S3Client({
  region: env.WASABI_REGION,
  endpoint: env.WASABI_ENDPOINT,
  credentials: { accessKeyId: env.WASABI_ACCESS_KEY_ID, secretAccessKey: env.WASABI_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

const { rows: players } = await db.execute(
  `SELECT id, name, headshotUrl, rekognitionFaceId FROM Player WHERE headshotUrl IS NOT NULL`
);

console.log(`Re-enrolling ${players.length} players...`);

let succeeded = 0;
const failures = [];

for (const player of players) {
  try {
    if (player.rekognitionFaceId) {
      await rekognition.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: [player.rekognitionFaceId] }));
    }

    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.WASABI_BUCKET, Key: player.headshotUrl }), { expiresIn: 300 });
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());

    const res = await rekognition.send(new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: bytes },
      ExternalImageId: player.id,
      MaxFaces: 1,
      QualityFilter: 'AUTO',
      DetectionAttributes: [],
    }));

    const faceId = res.FaceRecords?.[0]?.Face?.FaceId;
    if (!faceId) throw new Error('No face detected in headshot');

    await db.execute({
      sql: `UPDATE Player SET rekognitionFaceId = ?, faceEnrolledAt = ? WHERE id = ?`,
      args: [faceId, new Date().toISOString(), player.id],
    });

    console.log(`OK   ${player.name} -> ${faceId}`);
    succeeded++;
  } catch (err) {
    console.error(`FAIL ${player.name}: ${err.message}`);
    failures.push({ name: player.name, id: player.id, message: err.message });
  }
}

console.log(`\nDone: ${succeeded}/${players.length} re-enrolled.`);
if (failures.length) {
  console.log('Failures:', JSON.stringify(failures, null, 2));
}
