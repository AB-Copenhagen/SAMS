import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { getPresignedUrl, uploadFileToWasabi } from '../../../../../lib/wasabi';

const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // a headshot is a single portrait photo, not a press-shoot original

// Uploads a candidate headshot photo to Wasabi and hands back its object key — it does NOT touch
// the Player row. The edit form still has to PUT /api/players/[id] with that key to actually save
// it, which is what triggers face re-enrollment; this endpoint just gets pixels into storage so
// the form has something to submit.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ message: 'No file provided' }, { status: 400 });

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) return NextResponse.json({ message: 'File must be a JPEG, PNG, or WebP image' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ message: 'Image is too large (max 20MB)' }, { status: 413 });

  const objectKey = `players/${params.id}-${Date.now()}.${ext}`;
  await uploadFileToWasabi(objectKey, new Uint8Array(await file.arrayBuffer()), file.type);

  return NextResponse.json({ objectKey });
}

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const player = await prisma.player.findUnique({ where: { id: params.id }, select: { headshotUrl: true } });
  if (!player?.headshotUrl) return NextResponse.json({ message: 'No headshot' }, { status: 404 });

  const val = player.headshotUrl;
  if (val.startsWith('http://') || val.startsWith('https://')) {
    return NextResponse.redirect(val, { status: 307 });
  }

  // Wasabi objectKey — generate presigned URL
  const signed = await getPresignedUrl(val);
  return NextResponse.redirect(signed, { status: 307 });
}
