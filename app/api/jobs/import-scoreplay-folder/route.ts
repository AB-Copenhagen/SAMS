import { NextResponse } from 'next/server';
import { verifyQstashSignature } from '../../../../lib/qstash';
import { pairScoreplayFolder, processScoreplayBatch, publishJobWithRetry, SCOREPLAY_FOLDERS } from '../../../../lib/scoreplay-import';

// QStash job: imports one batch of a single scoreplay/<folder>/ directory, then re-enqueues
// itself with the next offset until that folder is exhausted — one chain per folder, kicked off
// by app/api/system/start-scoreplay-import. See lib/scoreplay-import.ts for the actual logic.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const BATCH_TIME_BUDGET_MS = 45_000; // leaves margin under maxDuration for the re-enqueue call itself

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyQstashSignature(request, rawBody))) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const { folder, offset } = JSON.parse(rawBody) as { folder?: string; offset?: number };
  if (!folder || !SCOREPLAY_FOLDERS.includes(folder)) {
    return NextResponse.json({ message: `Unknown folder: ${folder}` }, { status: 400 });
  }

  const pairs = await pairScoreplayFolder(folder);
  const { result, nextIndex } = await processScoreplayBatch(folder, pairs, offset ?? 0, BATCH_TIME_BUDGET_MS);
  const done = nextIndex >= pairs.length;

  let chained = true;
  if (!done) {
    chained = await publishJobWithRetry('/api/jobs/import-scoreplay-folder', { folder, offset: nextIndex });
    if (!chained) {
      console.error(`[scoreplay-import] ${folder}: FAILED to re-enqueue at offset ${nextIndex} after retries — chain is now stalled, re-run start-scoreplay-import for this folder to resume`);
    }
  }

  console.log(`[scoreplay-import] ${folder}: ${offset ?? 0}->${nextIndex}/${pairs.length} — ${JSON.stringify(result)}${done ? ' DONE' : chained ? '' : ' CHAIN BROKEN'}`);
  return NextResponse.json({ folder, offset: offset ?? 0, nextIndex, total: pairs.length, done, chained, result });
}
