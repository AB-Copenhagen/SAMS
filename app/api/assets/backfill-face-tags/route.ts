import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-time correction: Asset.faceTagStatus defaults to 'pending' for every row (including
// pre-existing video assets, which should never be face-searched). Marks non-image assets
// 'skipped' so the cron face-search loop only ever processes real images. Existing image
// assets are left at their default 'pending' — the cron sweep drains them gradually.
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const result = await prisma.asset.updateMany({
    where: { faceTagStatus: 'pending', NOT: { fileType: { startsWith: 'image/' } } },
    data: { faceTagStatus: 'skipped' },
  });

  const pendingImages = await prisma.asset.count({
    where: { faceTagStatus: 'pending', fileType: { startsWith: 'image/' } },
  });

  return NextResponse.json({ skippedNonImages: result.count, pendingImages });
}
