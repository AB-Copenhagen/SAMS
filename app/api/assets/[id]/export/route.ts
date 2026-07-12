import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { renderExport, EXPORT_PRESETS } from '../../../../../lib/export-presets';

export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const presetKey = searchParams.get('preset') ?? '';
  if (!EXPORT_PRESETS[presetKey]) {
    return NextResponse.json({ message: `Unknown preset. Valid: ${Object.keys(EXPORT_PRESETS).join(', ')}` }, { status: 400 });
  }

  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { objectKey: true, editedKey: true, title: true } });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const buffer = await renderExport(asset.editedKey ?? asset.objectKey, presetKey);
    const filename = `${(asset.title || 'photo').replace(/[^a-z0-9-_]/gi, '-')}-${presetKey}.jpg`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    console.error('[assets/export]', message);
    return NextResponse.json({ message }, { status: 502 });
  }
}
