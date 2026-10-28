import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { listSegments, debugRawSegmentMembersPage } from '../../../../lib/goliath';

// Temporary read-only diagnostic: dumps the real, unparsed shape of each Goliath segment's member
// rows. app/api/cron/sync-goliath-segments reports success but matches zero customers, and
// getSegmentMembers's goliathId/externalId/email field-name guess (lib/goliath.ts) was never
// confirmed against a real segment — this is step one in confirming (or ruling out) that as the
// cause. Delete this route, the debugRawSegmentMembersPage export, and this comment once resolved.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/debug-goliath-segments').then(r => r.json()).then(console.log)
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const segments = await listSegments();
  const samples = [];
  for (const segment of segments.slice(0, 5)) {
    samples.push({ segment, raw: await debugRawSegmentMembersPage(segment.id) });
  }
  return NextResponse.json({ segments, samples });
}
