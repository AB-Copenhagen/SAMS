import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { enrollPlayerFace } from '../../../../lib/rekognition';

export const maxDuration = 60;

export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // Collection provisioning is a one-time infra step (scripts/setup-rekognition-collection.mjs,
  // run with broader admin credentials) — the app's own runtime IAM user is deliberately scoped
  // without rekognition:CreateCollection, so this route must not attempt to create it.

  const players = await prisma.player.findMany({
    where: { active: true, faceEnrolledAt: null, headshotUrl: { not: null } },
  });

  let enrolled = 0;
  const errors: Array<{ playerId: string; name: string; message: string }> = [];

  for (const player of players) {
    try {
      const { faceId } = await enrollPlayerFace(player.headshotUrl!);
      await prisma.player.update({ where: { id: player.id }, data: { rekognitionFaceId: faceId, faceEnrolledAt: new Date() } });
      enrolled++;
    } catch (err) {
      errors.push({ playerId: player.id, name: player.name, message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return NextResponse.json({ total: players.length, enrolled, errors });
}
