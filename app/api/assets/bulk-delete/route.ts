import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { deleteFileFromWasabi } from '../../../../lib/wasabi';

// Bulk counterpart to DELETE /api/assets/[id] — same per-asset semantics (DB row removed even if
// the best-effort Wasabi object delete fails), just looped, so one slow/missing object can't abort
// the rest of a multi-select delete from the media library.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ message: 'No ids provided' }, { status: 400 });

  let deleted = 0;
  const failed: string[] = [];

  for (const id of ids) {
    try {
      const asset = await prisma.asset.findUnique({ where: { id }, select: { objectKey: true } });
      if (!asset) { failed.push(id); continue; }

      await prisma.asset.delete({ where: { id } });
      try {
        await deleteFileFromWasabi(asset.objectKey);
      } catch (err) {
        console.warn('[bulk-delete] Wasabi removal failed (DB record already deleted):', err);
      }
      deleted++;
    } catch (err) {
      console.error(`[bulk-delete] failed for asset ${id}:`, err);
      failed.push(id);
    }
  }

  return NextResponse.json({ success: failed.length === 0, deleted, failed });
}
