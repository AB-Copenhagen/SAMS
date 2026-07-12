import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { enrollPlayerFace, deletePlayerFace } from '../../../../lib/rekognition';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json();

  const existing = await prisma.player.findUnique({ where: { id: params.id } });
  const newHeadshotUrl = body.headshotUrl || null;
  const headshotChanged = existing && newHeadshotUrl !== existing.headshotUrl;

  const player = await prisma.player.update({
    where: { id: params.id },
    data: {
      name:        body.name,
      number:      body.number ? Number(body.number) : null,
      position:    body.position  || null,
      headshotUrl: newHeadshotUrl,
      team:        body.team        || null,
      seasonId:    body.seasonId    || null,
      active:      body.active ?? true,
    },
    include: { season: { select: { id: true, name: true } } },
  });

  let faceEnrollmentError: string | undefined;
  if (headshotChanged) {
    if (existing?.rekognitionFaceId) {
      await deletePlayerFace(existing.rekognitionFaceId).catch(() => {});
      await prisma.player.update({ where: { id: player.id }, data: { rekognitionFaceId: null, faceEnrolledAt: null } });
    }
    if (newHeadshotUrl) {
      try {
        const { faceId } = await enrollPlayerFace(newHeadshotUrl, player.id);
        await prisma.player.update({ where: { id: player.id }, data: { rekognitionFaceId: faceId, faceEnrolledAt: new Date() } });
      } catch (err) {
        faceEnrollmentError = err instanceof Error ? err.message : 'Face enrollment failed';
      }
    }
  }

  return NextResponse.json({ ...player, faceEnrollmentError });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const player = await prisma.player.findUnique({ where: { id: params.id } });
  if (player?.rekognitionFaceId) {
    await deletePlayerFace(player.rekognitionFaceId).catch(() => {});
  }
  await prisma.player.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
