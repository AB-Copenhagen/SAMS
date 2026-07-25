// One-time setup script: builds a Vercel Sandbox snapshot with a static ffmpeg/ffprobe build
// pre-installed, so lib/video-thumbnail.ts's per-asset sandbox invocations start in ~1s instead
// of re-downloading and installing ffmpeg every time.
//
// Amazon Linux 2023 (the sandbox's base image) doesn't carry ffmpeg in its own dnf repos (the
// H.264/AAC codecs are patent-encumbered and excluded), so this installs a static self-contained
// build from johnvansickle.com instead of relying on a system package.
//
// Usage: node scripts/build-video-sandbox-snapshot.mjs
// Then set VIDEO_SANDBOX_SNAPSHOT_ID to the printed snapshot ID (locally in .env.local, and in
// Vercel's Production/Preview env vars).
//
// Needs Vercel API credentials to run locally (OIDC auth is automatic only when running ON
// Vercel) — set VERCEL_TOKEN/VERCEL_TEAM_ID/VERCEL_PROJECT_ID in .env.local first, or export
// them in the shell. See .env.example.

import { Sandbox } from '@vercel/sandbox';
import { readFileSync, existsSync } from 'fs';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return {};
  return Object.fromEntries(
    readFileSync('.env.local', 'utf-8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const eq = l.indexOf('=');
        return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^"|"$/g, '')];
      }),
  );
}

const env = { ...loadEnvLocal(), ...process.env };
const credentials = (env.VERCEL_TOKEN && env.VERCEL_TEAM_ID && env.VERCEL_PROJECT_ID)
  ? { token: env.VERCEL_TOKEN, teamId: env.VERCEL_TEAM_ID, projectId: env.VERCEL_PROJECT_ID }
  : {};

const FFMPEG_STATIC_URL = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';

async function run() {
  console.log('Creating sandbox...');
  const sandbox = await Sandbox.create({ ...credentials, runtime: 'node24', timeout: 300_000 });
  console.log('Sandbox created:', sandbox.name);

  try {
    console.log('Installing xz (needed to extract the static ffmpeg build)...');
    const xz = await sandbox.runCommand('sudo', ['dnf', 'install', '-y', 'xz']);
    if (xz.exitCode !== 0) throw new Error(`dnf install xz failed:\n${await xz.output('both')}`);

    console.log('Downloading static ffmpeg build...');
    const install = await sandbox.runCommand('sh', ['-c', [
      'cd /tmp',
      `curl -fsSL -o ffmpeg.tar.xz ${FFMPEG_STATIC_URL}`,
      'tar xf ffmpeg.tar.xz',
      'FFDIR=$(find . -maxdepth 1 -iname "ffmpeg-*-amd64-static" -type d | head -1)',
      'sudo cp "$FFDIR/ffmpeg" "$FFDIR/ffprobe" /usr/local/bin/',
      'sudo chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe',
      'rm -rf /tmp/ffmpeg.tar.xz "$FFDIR"',
    ].join(' && ')]);
    if (install.exitCode !== 0) throw new Error(`ffmpeg install failed:\n${await install.output('both')}`);

    console.log('Verifying ffmpeg/ffprobe...');
    const verify = await sandbox.runCommand('sh', ['-c', 'ffmpeg -version && ffprobe -version']);
    if (verify.exitCode !== 0) throw new Error(`verification failed:\n${await verify.output('both')}`);
    console.log((await verify.stdout()).split('\n').slice(0, 2).join('\n'));

    console.log('Creating snapshot...');
    const snapshot = await sandbox.snapshot();
    console.log('\nSnapshot ready:', snapshot.snapshotId);
    console.log('\nSet this in .env.local and in Vercel Production/Preview env vars:');
    console.log(`VIDEO_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
  } finally {
    // snapshot() already stops the sandbox as part of creating the snapshot; this is a no-op
    // safety net if snapshot() failed before reaching that point.
    await sandbox.stop().catch(() => {});
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
