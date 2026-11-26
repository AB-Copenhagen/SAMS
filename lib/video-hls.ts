import { Sandbox } from '@vercel/sandbox';
import { getPresignedUrl, uploadFileToWasabi } from './wasabi';

// Same ffmpeg/ffprobe snapshot as lib/video-thumbnail.ts — see that file's comment for why a
// snapshot is required (no ffmpeg in Vercel Sandbox's base Amazon Linux repos).
const SNAPSHOT_ID = process.env.VIDEO_SANDBOX_SNAPSHOT_ID;
// A full ABR transcode is a different order of workload than a single poster-frame grab (45s in
// lib/video-thumbnail.ts) — generous enough for a multi-rendition encode of a typical press/media
// clip. The calling job route's own `maxDuration` must be at least this high (see Phase 3).
const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
const WORKDIR = '/tmp/hls';

// Candidate rendition ladder, highest first. Filtered down to rungs at or below the source height
// at transcode time — no point upscaling a 480p source to a fake 1080p rendition.
const RENDITION_LADDER = [
  { height: 1080, videoBitrate: '5000k', maxrate: '5350k', bufsize: '7500k', audioBitrate: '192k' },
  { height: 720, videoBitrate: '2800k', maxrate: '3000k', bufsize: '4200k', audioBitrate: '128k' },
  { height: 480, videoBitrate: '1200k', maxrate: '1300k', bufsize: '1800k', audioBitrate: '96k' },
] as const;

type Rendition = (typeof RENDITION_LADDER)[number];

interface FfprobeOutput {
  streams?: { height?: number }[];
}

export interface VideoHlsResult {
  hlsKey: string;
}

// Shared by the staff and share-token HLS streaming routes (app/api/assets/[id]/hls/[...path],
// app/api/share/[token]/assets/[assetId]/hls/[...path]): resolves a request's `[...path]` segments
// (untrusted — taken straight from the URL) to the Wasabi key generateVideoHls wrote them under.
// Rejects anything that isn't a plain relative path component to rule out traversal (`..`) or
// escaping the asset's own `hls/{objectKey}/` prefix.
export function resolveHlsObjectKey(objectKey: string, pathSegments: string[]): string | null {
  if (pathSegments.length === 0) return null;
  if (pathSegments.some((seg) => !/^[\w.-]+$/.test(seg) || seg === '.' || seg === '..')) return null;
  return `hls/${objectKey}/${pathSegments.join('/')}`;
}

// Self-contained like generateVideoThumbnail: runs its own ffprobe rather than depending on the
// separate generate-thumbnail job's result — the two jobs are enqueued concurrently at ingest
// completion (app/api/ingest/sessions/[id]/complete), not sequentially, so there's no guarantee
// videoWidth/videoHeight are populated yet when this runs.
export async function generateVideoHls(objectKey: string): Promise<VideoHlsResult> {
  if (!SNAPSHOT_ID) {
    throw new Error('VIDEO_SANDBOX_SNAPSHOT_ID is not set — run scripts/build-video-sandbox-snapshot.mjs first');
  }

  const inputUrl = await getPresignedUrl(objectKey);
  const sandbox = await Sandbox.create({
    timeout: SANDBOX_TIMEOUT_MS,
    source: { type: 'snapshot', snapshotId: SNAPSHOT_ID },
    // Same reasoning as video-thumbnail.ts: one-off, unnamed, never resumed — persistence would
    // auto-snapshot the whole filesystem on stop() and bill it for 30 days.
    persistent: false,
  });

  try {
    const probe = await sandbox.runCommand('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=height',
      '-of', 'json',
      inputUrl,
    ]);
    if (probe.exitCode !== 0) throw new Error(`ffprobe failed: ${await probe.stderr()}`);
    const probeJson: FfprobeOutput = JSON.parse(await probe.stdout());
    const sourceHeight = probeJson.streams?.[0]?.height ?? null;

    const renditions: Rendition[] = sourceHeight
      ? RENDITION_LADDER.filter((r) => r.height <= sourceHeight)
      : [];
    // Source is smaller than the lowest rung (or height couldn't be read) — fall back to one
    // rendition at the lowest bitrate rather than producing no renditions at all.
    if (renditions.length === 0) renditions.push(RENDITION_LADDER[RENDITION_LADDER.length - 1]);

    await sandbox.mkDir(WORKDIR);
    for (let i = 0; i < renditions.length; i++) {
      await sandbox.mkDir(`${WORKDIR}/v${i}`);
    }

    const splitLabels = renditions.map((_, i) => `[v${i}]`).join('');
    const scaleFilters = renditions.map((r, i) => `[v${i}]scale=-2:${r.height}[v${i}out]`).join('; ');
    const filterComplex = `[0:v]split=${renditions.length}${splitLabels}; ${scaleFilters}`;

    // -g/-keyint_min/-sc_threshold apply once to the whole encode (ffmpeg doesn't take a
    // per-stream specifier for them the way it does for -c:v/-b:v), so they're set once below,
    // not per rendition.
    const videoMapArgs = renditions.flatMap((r, i) => [
      '-map', `[v${i}out]`,
      `-c:v:${i}`, 'libx264', '-preset', 'veryfast',
      `-b:v:${i}`, r.videoBitrate, `-maxrate:${i}`, r.maxrate, `-bufsize:${i}`, r.bufsize,
    ]);
    const audioMapArgs = renditions.flatMap((r, i) => [
      '-map', 'a:0',
      `-c:a:${i}`, 'aac', `-b:a:${i}`, r.audioBitrate,
    ]);
    const varStreamMap = renditions.map((_, i) => `v:${i},a:${i}`).join(' ');

    const transcode = await sandbox.runCommand('ffmpeg', [
      '-i', inputUrl,
      '-filter_complex', filterComplex,
      ...videoMapArgs,
      ...audioMapArgs,
      // Aligned GOPs across renditions (2s @ 24fps-ish ceiling) so ABR switching lands on a
      // keyframe boundary in every rendition, not mid-segment.
      '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
      '-f', 'hls',
      '-hls_time', '6',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', `${WORKDIR}/v%v/seg_%03d.ts`,
      '-master_pl_name', 'master.m3u8',
      '-var_stream_map', varStreamMap,
      '-y', `${WORKDIR}/v%v/playlist.m3u8`,
    ]);
    if (transcode.exitCode !== 0) throw new Error(`ffmpeg HLS transcode failed: ${await transcode.stderr()}`);

    for (let i = 0; i < renditions.length; i++) {
      const files = await sandbox.fs.readdir(`${WORKDIR}/v${i}`);
      for (const file of files) {
        const buf = await sandbox.readFileToBuffer({ path: `${WORKDIR}/v${i}/${file}` });
        if (!buf) throw new Error(`HLS output file missing after transcode: v${i}/${file}`);
        await uploadFileToWasabi(`hls/${objectKey}/v${i}/${file}`, buf, contentTypeFor(file));
      }
    }

    const masterBuf = await sandbox.readFileToBuffer({ path: `${WORKDIR}/master.m3u8` });
    if (!masterBuf) throw new Error('ffmpeg did not produce a master playlist');
    const hlsKey = `hls/${objectKey}/master.m3u8`;
    await uploadFileToWasabi(hlsKey, masterBuf, contentTypeFor('master.m3u8'));

    return { hlsKey };
  } finally {
    await sandbox.stop();
  }
}

function contentTypeFor(filename: string): string {
  if (filename.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (filename.endsWith('.ts')) return 'video/mp2t';
  return 'application/octet-stream';
}
