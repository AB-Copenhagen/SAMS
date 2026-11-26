import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveShareTarget, sanitizePublicAsset } from '../../../../lib/collections';
import { exportUrl, isImage, originalUrl, hlsUrl } from '../../../../lib/public-asset-share';
import { logShareEvent } from '../../../../lib/share-analytics';
import SharePasswordForm from '../../../../components/SharePasswordForm';
import { SaveShareMenu } from '../../../../components/PublicAssetView';
import VideoPlayer from '../../../../components/VideoPlayer';

// oEmbed discovery (gh-123) — see app/s/[token]/page.tsx's generateMetadata for why this isn't
// gated on whether the link actually resolves.
export async function generateMetadata(props: { params: Promise<{ token: string; assetId: string }> }): Promise<Metadata> {
  const { token, assetId } = await props.params;
  const appBaseUrl = (process.env.PUBLIC_SHARE_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
  const shareUrl = `${appBaseUrl}/s/${token}/${assetId}`;
  return {
    alternates: {
      types: { 'application/json+oembed': `/api/oembed?url=${encodeURIComponent(shareUrl)}` },
    },
  };
}

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
          <VideoPlayer
            src={originalUrl(token, asset.id)}
            hlsSrc={asset.hlsStatus === 'done' ? hlsUrl(token, asset.id) : null}
            controls
          />
        )}
      </div>
    </div>
  );
}
