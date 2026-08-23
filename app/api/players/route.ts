import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { enrollPlayerFace } from '../../../lib/rekognition';
import { getCachedPlayers, invalidatePlayers } from '../../../lib/lookup-cache';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const players = await getCachedPlayers();
  return NextResponse.json(players);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const player = await prisma.player.create({
    data: { name: body.name, number: body.number ? Number(body.number) : null, position: body.position ?? null, headshotUrl: body.headshotUrl ?? null },
  });

  let faceEnrollmentError: string | undefined;
  if (player.headshotUrl) {
    try {
      const { faceId } = await enrollPlayerFace(player.headshotUrl, player.id);
      await prisma.player.update({ where: { id: player.id }, data: { rekognitionFaceId: faceId, faceEnrolledAt: new Date() } });
    } catch (err) {
      faceEnrollmentError = err instanceof Error ? err.message : 'Face enrollment failed';
    }
  }

  invalidatePlayers();
  return NextResponse.json({ ...player, faceEnrollmentError });
}
