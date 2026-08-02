import { NextResponse } from 'next/server';
import { resolveShareTarget } from '../../../../../../../lib/collections';
import { renderExport, EXPORT_PRESETS } from '../../../../../../../lib/export-presets';

export const maxDuration = 60;

// Resized/re-encoded exports for public sharing — same presets and rendering path as the admin
// photo editor's export route, so external collaborators can grab a fast, right-sized image
// (web/social) without pulling the full original.
export async function GET(request: Request, props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;

  const { searchParams } = new URL(request.url);
  const presetKey = searchParams.get('preset') ?? '';
  if (!EXPORT_PRESETS[presetKey]) {
    return NextResponse.json({ message: `Unknown preset. Valid: ${Object.keys(EXPORT_PRESETS).join(', ')}` }, { status: 400 });
  }

  const target = await resolveShareTarget(token, assetId);
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (target.kind === 'password-required') return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = target.asset;
  if (!asset.fileType.startsWith('image/')) {
    return NextResponse.json({ message: 'Resized exports are only available for images' }, { status: 400 });
  }

  try {
    const buffer = await renderExport(asset.editedKey ?? asset.objectKey, presetKey);
    const filename = `${(asset.title || 'photo').replace(/[^a-z0-9-_]/gi, '-')}-${presetKey}.jpg`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    console.error('[share/export]', message);
    return NextResponse.json({ message }, { status: 502 });
  }
}
