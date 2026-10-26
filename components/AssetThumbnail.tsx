export interface AssetThumbnailProps {
  id: string;
  title: string | null;
  fileType: string;
  thumbnailKey: string | null;
  thumbnailStatus: string;
  /** Presigned URL straight to Wasabi, precomputed in bulk by lib/thumbnail.ts's
   * attachThumbnailUrls for the whole page of assets at once. When present, used directly —
   * avoiding a per-image round trip through the /api/assets/[id]/thumbnail route. */
  thumbnailUrl?: string;
}

// Shared "thumbnail cell" used by every gallery card view (media library, collections,
// players/sponsors pages, home dashboard). Falls back to the thumbnail route (which falls back to
// the original object if thumbnailKey is null, per app/api/assets/[id]/thumbnail/route.ts) only
// when the caller didn't supply a precomputed thumbnailUrl — i.e. a freshly-uploaded asset whose
// thumbnail hasn't been generated yet. Video only gets the same treatment once its poster frame
// has actually been generated (thumbnailStatus === 'done') — hitting the thumbnail route for a
// video with no poster yet would redirect <img> at the raw video file and render a broken image,
// so it falls back to the 🎬 placeholder until then.
export default function AssetThumbnail({ id, title, fileType, thumbnailKey, thumbnailStatus, thumbnailUrl }: AssetThumbnailProps) {
  const isImage = fileType.startsWith('image/');
  const isVideo = fileType.startsWith('video/');
  const showThumbnail = isImage || (isVideo && thumbnailKey && thumbnailStatus === 'done');

  return (
    <>
      {showThumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl ?? `/api/assets/${id}/thumbnail`} alt={title ?? ''} loading="lazy" />
      ) : '🎬'}
      {isVideo && <span className="video-badge">Video</span>}
    </>
  );
}
