import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { getPresignedUrl } from '../../../../../lib/wasabi';

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const sponsor = await prisma.sponsor.findUnique({ where: { id: params.id }, select: { logoUrl: true } });
  if (!sponsor?.logoUrl) return NextResponse.json({ message: 'No logo' }, { status: 404 });

  const val = sponsor.logoUrl;
  if (val.startsWith('http://') || val.startsWith('https://')) {
    return NextResponse.redirect(val, { status: 307 });
  }

  // Wasabi objectKey — generate presigned URL
  const signed = await getPresignedUrl(val);
  return NextResponse.redirect(signed, { status: 307 });
}
