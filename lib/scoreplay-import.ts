import { prisma } from './db';
import { listAllObjectsUnderPrefix, fetchObjectJson, hashObjectSha256 } from './wasabi';
import { publishJob } from './qstash';

// Production-side counterpart to scripts/import-scoreplay-assets.mjs — runs as a chunked,
// self-re-enqueuing QStash job chain (one per folder) instead of a local one-shot script, since
// real Wasabi/Turso credentials proved hard to get onto a local machine safely. Rekognition is
// intentionally never invoked here (cost/time tradeoff) — see app/api/jobs/import-scoreplay-folder.

const SCOREPLAY_PREFIX = 'scoreplay/';

// Confirmed by the Phase 0 inventory — every other scoreplay/ folder is a game fixture, and no
// two folders (including the ASCII/diacritic spelling variants) turned out to be duplicates.
export const SCOREPLAY_FOLDERS = [
  'AB - B93 (Friendly)', 'AB - FA2000 (Friendly)', 'AB - FC Roskilde (Friendly)',
  'AB - Helsingborgs IF (Friendly)', 'AB - Hørsholm-Usserød (Friendly)', 'AB - Sundby BK (Friendly)',
  'AB Gladsaxe vs B93 (Cup)', 'AB Gladsaxe vs BK Fremad Amager (regular season)',
  'AB Gladsaxe vs Brabrand IF (regular season)', 'AB Gladsaxe vs FC Helsingoer (regular season)',
  'AB Gladsaxe vs FC Roskilde (regular season)', 'AB Gladsaxe vs HIK (regular season)',
  'AB Gladsaxe vs HIK Hellerup (regular season)', 'AB Gladsaxe vs Ishoej IF (regular season)',
  'AB Gladsaxe vs Naestved BK (regular season)', 'AB Gladsaxe vs Næstved BK (regular season)',
  'AB Gladsaxe vs Skive IK (regular season)', 'AB Gladsaxe vs Thisted FC (regular season)',
  'AB Gladsaxe vs Vendsyssel FF (regular season)', 'AB Gladsaxe vs Vsk Aarhus (regular season)',
  'Aarhus Fremad (regular season)', 'BK Fremad Amager (regular season)',
  'BK Fremad Amager vs AB Gladsaxe (regular season)', 'Brabrand IF vs AB Gladsaxe (regular season)',
  'Brøndby IF - AB (Friendly)', 'Brønshøj BK - AB (Friendly)', 'FA2000 - AB (Friendly)',
  'FC Helsingoer vs AB Gladsaxe (regular season)', 'FC Roskilde vs AB Gladsaxe (regular season)',
  'FC Rudersdal - AB Gladsaxe (Cup)', 'First Training - Season 26-27', 'Fremad Amager - AB (Friendly)',
  'HB Køge - AB (Friendly)', 'HIK Hellerup vs AB Gladsaxe (regular season)', 'HIK vs AB Gladsaxe (regular season)',
  'Hvidovre IF - AB (Friendly)', 'Investor and Fan Content', 'Ishoej IF vs AB Gladsaxe (regular season)',
  'Ishøj IF vs AB Gladsaxe (regular season)', 'Middelfart BK (regular season)', 'Naestved BK (regular season)',
  'Naestved BK vs AB Gladsaxe (regular season)', 'Næstved BK vs AB Gladsaxe (regular season)',
  'Skive IK (regular season)', 'Skive IK vs AB Gladsaxe (regular season)', 'Socials',
  'Thisted FC vs AB Gladsaxe (regular season)', 'Training', 'Trelleborg FF - AB (Friendly)',
  'Vejle BK vs AB Gladsaxe (regular season)', 'Vendsyssel FF vs AB Gladsaxe (regular season)',
  'Vsk Aarhus vs AB Gladsaxe (regular season)',
];

const NON_GAME_TYPES: Record<string, string> = {
  'Training': 'training',
  'First Training - Season 26-27': 'training',
  'Socials': 'social',
  'Investor and Fan Content': 'investor',
};

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
};

function extMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

function buildAssetUrl(objectKey: string): string {
  const host = process.env.WASABI_ENDPOINT!.replace(/\/$/, '').replace(/^https?:\/\//, '');
  const bucket = process.env.WASABI_BUCKET!;
  const encoded = objectKey.split('/').map(encodeURIComponent).join('/');
  return `https://${host}/${bucket}/${encoded}`;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A chain's self-re-enqueue call is the one publishJob failure that can't just be logged and
 * moved past — if it's lost, that folder's import silently stops forever (QStash's own retry
 * only covers the CURRENT invocation, not a dropped future one). A few quick retries absorb a
 * transient blip (e.g. QStash briefly rate-limiting under the burst of many folders publishing
 * at once) without waiting on QStash's own backoff timing.
 */
export async function publishJobWithRetry(path: string, body: unknown, attempts = 3): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await publishJob(path, body);
    } catch (err) {
      console.error(`[scoreplay-import] publishJob attempt ${i + 1}/${attempts} failed for ${path}:`, err);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  return false;
}

export interface ScoreplayPair { mediaKey: string; jsonKey: string; filename: string; size: number }

export async function pairScoreplayFolder(folder: string): Promise<ScoreplayPair[]> {
  const prefix = `${SCOREPLAY_PREFIX}${folder}/`;
  const objects = await listAllObjectsUnderPrefix(prefix);
  const byBase = new Map<string, Partial<ScoreplayPair>>();
  for (const { key, size } of objects) {
    const rel = key.slice(prefix.length);
    if (!rel) continue;
    const dot = rel.lastIndexOf('.');
    if (dot === -1) continue;
    const base = rel.slice(0, dot);
    const ext = rel.slice(dot + 1).toLowerCase();
    const entry = byBase.get(base) ?? {};
    if (ext === 'json') entry.jsonKey = key;
    else { entry.mediaKey = key; entry.filename = rel; entry.size = size; }
    byBase.set(base, entry);
  }
  const pairs: ScoreplayPair[] = [];
  for (const entry of byBase.values()) {
    if (entry.mediaKey && entry.jsonKey) pairs.push(entry as ScoreplayPair);
  }
  // Stable order is required — offset-based resume across invocations depends on it.
  pairs.sort((a, b) => a.mediaKey.localeCompare(b.mediaKey));
  return pairs;
}

const seasonCache = new Map<string, string | null>();
async function getOrCreateSeason(name: string | null): Promise<string | null> {
  if (!name) return null;
  if (seasonCache.has(name)) return seasonCache.get(name)!;
  const existing = await prisma.season.findFirst({ where: { name } });
  const id = existing ? existing.id : (await prisma.season.create({ data: { name } })).id;
  seasonCache.set(name, id);
  return id;
}

const collectionCache = new Map<string, { id: string; seasonId: string | null }>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreateCollection(folder: string, sidecar: any): Promise<{ id: string; seasonId: string | null }> {
  const cached = collectionCache.get(folder);
  if (cached) return cached;
  const type = NON_GAME_TYPES[folder] ?? 'game';
  const seasonName: string | null = sidecar.seasons?.[0] ?? null;
  const seasonId = await getOrCreateSeason(seasonName);
  const date: Date | null = sidecar.collection?.date ? new Date(sidecar.collection.date) : null;

  const existing = await prisma.collection.findFirst({ where: { name: folder } });
  const result = existing
    ? { id: existing.id, seasonId: existing.seasonId }
    : { id: (await prisma.collection.create({ data: { name: folder, type, date, seasonId } })).id, seasonId };
  collectionCache.set(folder, result);
  return result;
}

let playerMapCache: Map<string, string> | null = null;
let sponsorMapCache: Map<string, string> | null = null;
async function loadLookupMaps(): Promise<{ playerMap: Map<string, string>; sponsorMap: Map<string, string> }> {
  if (playerMapCache && sponsorMapCache) return { playerMap: playerMapCache, sponsorMap: sponsorMapCache };

  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  playerMapCache = new Map(players.map((p) => [normalizeName(p.name), p.id]));

  const sponsors = await prisma.sponsor.findMany({ select: { id: true, name: true, aliasesJson: true } });
  sponsorMapCache = new Map();
  for (const s of sponsors) {
    sponsorMapCache.set(normalizeName(s.name), s.id);
    if (s.aliasesJson) {
      try {
        for (const alias of JSON.parse(s.aliasesJson) as string[]) sponsorMapCache.set(normalizeName(alias), s.id);
      } catch { /* malformed aliasesJson on an existing row — not this import's problem to fix */ }
    }
  }
  return { playerMap: playerMapCache, sponsorMap: sponsorMapCache };
}

export interface ImportBatchResult { processed: number; created: number; skippedExisting: number; skippedDup: number; failed: number }

type Outcome = 'created' | 'skippedExisting' | 'skippedDup';

async function processOnePair(
  folder: string,
  pair: ScoreplayPair,
  playerMap: Map<string, string>,
  sponsorMap: Map<string, string>,
): Promise<Outcome> {
  const existing = await prisma.asset.findUnique({ where: { objectKey: pair.mediaKey }, select: { id: true } });
  if (existing) return 'skippedExisting';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sidecar = await fetchObjectJson<any>(pair.jsonKey);
  const collection = await getOrCreateCollection(folder, sidecar);
  const hashed = await hashObjectSha256(pair.mediaKey);

  const dup = await prisma.asset.findUnique({ where: { contentHash: hashed.hex }, select: { id: true } });
  if (dup) return 'skippedDup';

  const fileType = hashed.contentType || extMime(pair.filename);
  const capturedTime: string | undefined = sidecar.dates?.captured_time;
  const exifJson = capturedTime && !capturedTime.startsWith('0000:')
    ? JSON.stringify({ DateTimeOriginal: capturedTime })
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerNames = [...new Set((sidecar.players ?? []).map((p: any): string => p.name).filter(Boolean) as string[])];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sponsorNames = [...new Set((sidecar.sponsors ?? []).map((s: any): string => s.name).filter(Boolean) as string[])];
  const matchedPlayerIds = playerNames.map((n) => playerMap.get(normalizeName(n))).filter((id): id is string => Boolean(id));
  const matchedSponsorIds = sponsorNames.map((n) => sponsorMap.get(normalizeName(n))).filter((id): id is string => Boolean(id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tagNames: string[] = (sidecar.tags ?? []).map((t: any) => t.name).filter(Boolean);

  const asset = await prisma.asset.create({
    data: {
      description: sidecar.description || null,
      eventName: folder,
      eventDate: sidecar.collection?.date ? new Date(sidecar.collection.date) : null,
      objectKey: pair.mediaKey,
      contentHash: hashed.hex,
      assetUrl: buildAssetUrl(pair.mediaKey),
      fileType,
      fileSize: hashed.size,
      uploaderEmail: 'scoreplay-import@ab-media.internal',
      uploaderRole: 'ADMIN',
      manualTagsJson: JSON.stringify(tagNames),
      exifJson,
      collectionId: collection.id,
      seasonId: collection.seasonId,
      // Our own Rekognition pipeline never runs for this import — player/sponsor tags come only
      // from ScorePlay's own sidecar data where it matches an existing Player/Sponsor row.
      // 'skipped' (not 'pending') still lets these surface in the review queue normally.
      faceTagStatus: 'skipped',
      thumbnailStatus: 'pending',
      importSource: 'scoreplay',
      legacyMetaJson: JSON.stringify(sidecar),
    },
  });

  for (const playerId of matchedPlayerIds) {
    await prisma.assetPlayerTag
      .create({ data: { assetId: asset.id, playerId, source: 'scoreplay', status: 'suggested' } })
      .catch((err) => console.warn(`[scoreplay-import] player tag insert failed for ${asset.id}:`, err));
  }
  for (const sponsorId of matchedSponsorIds) {
    await prisma.assetSponsorTag
      .create({ data: { assetId: asset.id, sponsorId, source: 'scoreplay', status: 'suggested' } })
      .catch((err) => console.warn(`[scoreplay-import] sponsor tag insert failed for ${asset.id}:`, err));
  }

  await publishJob('/api/jobs/generate-thumbnail', { assetId: asset.id });

  return 'created';
}

/**
 * Processes pairs[startIndex:] until either the array is exhausted or timeBudgetMs elapses,
 * whichever comes first. A per-pair failure is logged and counted, not thrown — one bad file
 * (a malformed sidecar, a transient Wasabi blip) shouldn't stall the whole folder's progress,
 * unlike the single-asset tag-asset/generate-thumbnail jobs where a throw-and-let-QStash-retry
 * model makes sense.
 */
export async function processScoreplayBatch(
  folder: string,
  pairs: ScoreplayPair[],
  startIndex: number,
  timeBudgetMs: number,
): Promise<{ result: ImportBatchResult; nextIndex: number }> {
  const { playerMap, sponsorMap } = await loadLookupMaps();
  const result: ImportBatchResult = { processed: 0, created: 0, skippedExisting: 0, skippedDup: 0, failed: 0 };
  const startedAt = Date.now();

  let i = startIndex;
  for (; i < pairs.length; i++) {
    if (Date.now() - startedAt > timeBudgetMs) break;
    result.processed++;
    try {
      const outcome = await processOnePair(folder, pairs[i], playerMap, sponsorMap);
      result[outcome]++;
    } catch (err) {
      console.error(`[scoreplay-import] FAIL ${pairs[i].mediaKey}:`, err);
      result.failed++;
    }
  }
  return { result, nextIndex: i };
}
