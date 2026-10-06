import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { publishJob } from '../../../../lib/qstash';
import { SCOREPLAY_FOLDERS } from '../../../../lib/scoreplay-import';

// Kicks off the ScorePlay import: one independent, self-re-enqueuing QStash job chain per folder
// (see app/api/jobs/import-scoreplay-folder), so folders import in parallel rather than one
// single sequential pass across all ~25-30k files.
//   fetch('/api/system/start-scoreplay-import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({}) }).then(r => r.json()).then(console.log)
// Pass { "folders": ["Fremad Amager - AB (Friendly)"] } to smoke-test a single (small) folder first.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const folders: string[] = Array.isArray(body.folders) && body.folders.length ? body.folders : SCOREPLAY_FOLDERS;

  const unknown = folders.filter((f) => !SCOREPLAY_FOLDERS.includes(f));
  if (unknown.length) {
    return NextResponse.json({ message: `Unknown folder(s): ${unknown.join(', ')}` }, { status: 400 });
  }

  let enqueued = 0;
  for (const folder of folders) {
    const ok = await publishJob('/api/jobs/import-scoreplay-folder', { folder, offset: 0 });
    if (ok) enqueued++;
  }

  return NextResponse.json({ enqueued, total: folders.length, folders });
}
