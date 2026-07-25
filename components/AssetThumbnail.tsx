export interface AssetThumbnailProps {
  id: string;
  title: string | null;
  fileType: string;
  thumbnailKey: string | null;
  thumbnailStatus: string;
}

// Shared "thumbnail cell" used by every gallery card view (media library, collections,
// players/sponsors pages, home dashboard). Images always try the thumbnail route (which falls
// back to the original object if thumbnailKey is null, per
// app/api/assets/[id]/thumbnail/route.ts). Video only gets the same treatment once its poster
// frame has actually been generated (thumbnailStatus === 'done') — hitting the thumbnail route
// for a video with no poster yet would redirect <img> at the raw video file and render a broken
// image, so it falls back to the 🎬 placeholder until then.
export default function AssetThumbnail({ id, title, fileType, thumbnailKey, thumbnailStatus }: AssetThumbnailProps) {
  const isImage = fileType.startsWith('image/');
  const isVideo = fileType.startsWith('video/');
  const showThumbnail = isImage || (isVideo && thumbnailKey && thumbnailStatus === 'done');

  return (
    <>
      {showThumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/${id}/thumbnail`} alt={title ?? ''} loading="lazy" />
      ) : '🎬'}
      {isVideo && <span className="video-badge">Video</span>}
    </>
  );
}
