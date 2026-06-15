import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { getPresignedUploadUrl } from '../../../../lib/wasabi';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });

  const { fileName, fileType, fileSize } = body as {
    fileName?: string;
    fileType?: string;
    fileSize?: number;
  };

  if (!fileName || !fileType || !fileSize) {
    return NextResponse.json({ message: 'fileName, fileType, and fileSize are required' }, { status: 400 });
  }

  if (!fileType.startsWith('image/') && !fileType.startsWith('video/')) {
    return NextResponse.json({ message: 'Only images and videos are allowed' }, { status: 400 });
  }

  const objectKey = `assets/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9_\-.]/g, '_')}`;

  let presignedUrl: string;
  try {
    presignedUrl = await getPresignedUploadUrl(objectKey, fileType, 300);
  } catch (err) {
    console.error('[upload/presign] failed to generate URL:', err);
    return NextResponse.json(
      { message: 'Could not generate upload URL: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }

  return NextResponse.json({ presignedUrl, objectKey });
}
