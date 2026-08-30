import { NextResponse } from 'next/server';
import { resolveShareTarget } from '../../../../../../../lib/collections';
import { getPresignedUrl } from '../../../../../../../lib/wasabi';
import { logShareEvent } from '../../../../../../../lib/share-analytics';
import { requestIp } from '../../../../../../../lib/rate-limit';

export async function GET(request: Request, props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;

  const target = await resolveShareTarget(token, assetId);
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (target.kind === 'password-required') return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  await logShareEvent({
    kind: 'download',
    token,
    collectionId: target.asset.collectionId,
    assetId: target.asset.id,
    ip: requestIp(request),
    userAgent: request.headers.get('user-agent'),
  });

  const url = await getPresignedUrl(target.asset.editedKey ?? target.asset.objectKey);
  return NextResponse.redirect(url, { status: 307 });
}
