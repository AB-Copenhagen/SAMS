import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const [assetCount, collectionCount, playerCount, sizeResult, recentAssets, recentCollections] = await Promise.all([
    prisma.asset.count(),
    prisma.collection.count(),
    prisma.player.count({ where: { active: true } }),
    prisma.asset.aggregate({ _sum: { fileSize: true } }),
    prisma.asset.findMany({ orderBy: { uploadedAt: 'desc' }, take: 8, select: { id: true, title: true, assetUrl: true, fileType: true, eventName: true, uploadedAt: true, fileSize: true } }),
    prisma.collection.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { _count: { select: { assets: true } }, season: { select: { name: true } } } }),
  ]);

  const storageMB = Math.round((sizeResult._sum.fileSize ?? 0) / 1024 / 1024);
  return NextResponse.json({ assetCount, collectionCount, playerCount, storageMB, recentAssets, recentCollections });
}
