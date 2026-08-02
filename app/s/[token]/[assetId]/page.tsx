import { notFound } from 'next/navigation';
import { resolveShareTarget, sanitizePublicAsset } from '../../../../lib/collections';
import { exportUrl, isImage, originalUrl } from '../../../../lib/public-asset-share';
import SharePasswordForm from '../../../../components/SharePasswordForm';
import { AssetDetails, DownloadOptions, ShareAction } from '../../../../components/PublicAssetView';

export default async function SharedAssetPage(props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;

  const target = await resolveShareTarget(token, assetId);
  if (!target) notFound();
  if (target.kind === 'password-required') {
    return <SharePasswordForm token={token} name={target.name} />;
  }

  const asset = sanitizePublicAsset(target.asset);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/AB1889.png" alt="AB Copenhagen" style={{ width: 40, height: 40 }} />
        <h1 style={{ margin: 0, fontSize: 18 }}>{asset.title || asset.eventName || 'Untitled'}</h1>
      </div>

      <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 440px', minWidth: 260 }}>
          {isImage(asset) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={exportUrl(token, asset.id, 'web')}
              alt={asset.title ?? ''}
              style={{ width: '100%', height: 'auto', borderRadius: 8, maxHeight: '70vh', objectFit: 'contain', background: '#0d0f1c' }}
            />
          ) : (
            <video
              src={originalUrl(token, asset.id)}
              controls
              style={{ width: '100%', borderRadius: 8, maxHeight: '70vh' }}
            />
          )}
        </div>

        <div style={{ flex: '0 1 260px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AssetDetails asset={asset} />
          <DownloadOptions token={token} asset={asset} />
          <ShareAction token={token} asset={asset} />
        </div>
      </div>
    </div>
  );
}
