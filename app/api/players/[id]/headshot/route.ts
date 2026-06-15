import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { getPresignedUrl } from '../../../../../lib/wasabi';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const player = await prisma.player.findUnique({ where: { id: params.id }, select: { headshotUrl: true } });
  if (!player?.headshotUrl) return NextResponse.json({ message: 'No headshot' }, { status: 404 });

  const val = player.headshotUrl;
  if (val.startsWith('http://') || val.startsWith('https://')) {
    return NextResponse.redirect(val, { status: 307 });
  }

  // Wasabi objectKey — generate presigned URL
  const signed = await getPresignedUrl(val, 3600);
  return NextResponse.redirect(signed, { status: 307 });
}
