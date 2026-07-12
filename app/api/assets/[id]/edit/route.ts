import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { uploadFileToWasabi } from '../../../../../lib/wasabi';
import { applyEdit, type EditParams } from '../../../../../lib/photo-edit';
import { generateThumbnail } from '../../../../../lib/thumbnail';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { objectKey: true, fileType: true } });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!asset.fileType.startsWith('image/')) {
    return NextResponse.json({ message: 'Editing is only supported for images' }, { status: 422 });
  }

  const body = await request.json().catch(() => null) as EditParams | null;
  if (!body) return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });

  try {
    // Always render from the pristine original — never re-edit an already-edited copy.
    const edited = await applyEdit(asset.objectKey, body);
    const editedKey = `edited/${asset.objectKey}.jpg`;
    await uploadFileToWasabi(editedKey, edited, 'image/jpeg');

    const thumbnailKey = await generateThumbnail(editedKey);

    const updated = await prisma.asset.update({
      where: { id: params.id },
      data: {
        editedKey,
        editParamsJson: JSON.stringify(body),
        thumbnailKey,
        thumbnailStatus: 'done',
      },
    });

    return NextResponse.json({ editedKey: updated.editedKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Edit failed';
    console.error('[assets/edit]', message);
    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { objectKey: true } });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const thumbnailKey = await generateThumbnail(asset.objectKey);

  await prisma.asset.update({
    where: { id: params.id },
    data: { editedKey: null, editParamsJson: null, thumbnailKey, thumbnailStatus: 'done' },
  });

  return NextResponse.json({ success: true });
}
