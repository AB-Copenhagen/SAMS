import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveShareTarget, sanitizePublicAsset } from '../../../../lib/collections';
import { exportUrl, isImage, originalUrl } from '../../../../lib/public-asset-share';
import { logShareEvent } from '../../../../lib/share-analytics';
import SharePasswordForm from '../../../../components/SharePasswordForm';
import { SaveShareMenu } from '../../../../components/PublicAssetView';

export default async function SharedAssetPage(props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;

  const target = await resolveShareTarget(token, assetId);
  if (!target) notFound();
  if (target.kind === 'password-required') {
    return <SharePasswordForm token={token} name={target.name} />;
  }

  const h = await headers();
  await logShareEvent({
    kind: 'view',
    token,
    collectionId: target.asset.collectionId,
    assetId: target.asset.id,
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    userAgent: h.get('user-agent'),
  });

  const asset = sanitizePublicAsset(target.asset);

  return (
    <div className="share-page" style={{ maxWidth: 900 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/AB1889.png" alt="AB Copenhagen" style={{ width: 32, height: 32, marginBottom: 16 }} />

      <div className="lightbox-stage-page">
        <SaveShareMenu token={token} asset={asset} />
        {isImage(asset) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={exportUrl(token, asset.id, 'web')} alt={asset.title || asset.eventName || 'Photo'} />
        ) : (
          <video src={originalUrl(token, asset.id)} controls />
        )}
      </div>
    </div>
  );
}
