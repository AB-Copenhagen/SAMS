import { Sandbox } from '@vercel/sandbox';
import { getPresignedUrl, uploadFileToWasabi } from './wasabi';

// Vercel Sandbox's Amazon Linux base has no ffmpeg in its own dnf repos (H.264/AAC are
// patent-encumbered and excluded from Amazon's repos) — VIDEO_SANDBOX_SNAPSHOT_ID points at a
// snapshot with a static ffmpeg/ffprobe build pre-installed (see
// scripts/build-video-sandbox-snapshot.mjs). Without it, a plain sandbox is used and ffmpeg is
// never installed, so extraction fails — that's an explicit setup step, not a silent fallback.
const SNAPSHOT_ID = process.env.VIDEO_SANDBOX_SNAPSHOT_ID;
const SANDBOX_TIMEOUT_MS = 45_000;
const POSTER_WIDTH = 400;

export interface VideoThumbnailResult {
  thumbnailKey: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

interface FfprobeOutput {
  streams?: { width?: number; height?: number }[];
  format?: { duration?: string };
}

export async function generateVideoThumbnail(objectKey: string): Promise<VideoThumbnailResult> {
  if (!SNAPSHOT_ID) {
    throw new Error('VIDEO_SANDBOX_SNAPSHOT_ID is not set — run scripts/build-video-sandbox-snapshot.mjs first');
  }

  const inputUrl = await getPresignedUrl(objectKey);
  const sandbox = await Sandbox.create({
    timeout: SANDBOX_TIMEOUT_MS,
    source: { type: 'snapshot', snapshotId: SNAPSHOT_ID },
  });

  try {
    const probe = await sandbox.runCommand('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-show_entries', 'format=duration',
      '-of', 'json',
      inputUrl,
    ]);
    if (probe.exitCode !== 0) throw new Error(`ffprobe failed: ${await probe.stderr()}`);
    const probeJson: FfprobeOutput = JSON.parse(await probe.stdout());
    const width = probeJson.streams?.[0]?.width ?? null;
    const height = probeJson.streams?.[0]?.height ?? null;
    const durationMs = probeJson.format?.duration
      ? Math.round(parseFloat(probeJson.format.duration) * 1000)
      : null;

    // Seek to 1s to avoid a black/blank opening frame; fall back to t=0 for clips under 1s.
    let extract = await sandbox.runCommand('ffmpeg', [
      '-ss', '1', '-i', inputUrl,
      '-vframes', '1', '-vf', `scale=${POSTER_WIDTH}:-1`, '-update', '1',
      '-y', '/tmp/poster.jpg',
    ]);
    if (extract.exitCode !== 0) {
      extract = await sandbox.runCommand('ffmpeg', [
        '-i', inputUrl,
        '-vframes', '1', '-vf', `scale=${POSTER_WIDTH}:-1`, '-update', '1',
        '-y', '/tmp/poster.jpg',
      ]);
    }
    if (extract.exitCode !== 0) throw new Error(`ffmpeg frame extraction failed: ${await extract.stderr()}`);

    const jpegBuffer = await sandbox.readFileToBuffer({ path: '/tmp/poster.jpg' });
    if (!jpegBuffer) throw new Error('ffmpeg did not produce a poster frame');

    const thumbnailKey = `thumbnails/${objectKey}.jpg`;
    await uploadFileToWasabi(thumbnailKey, jpegBuffer, 'image/jpeg');

    return { thumbnailKey, durationMs, width, height };
  } finally {
    await sandbox.stop();
  }
}
