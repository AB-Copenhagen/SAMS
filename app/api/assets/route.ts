import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q            = searchParams.get('q') ?? '';
  const type         = searchParams.get('type') ?? '';
  const seasonId     = searchParams.get('seasonId') ?? '';
  const category     = searchParams.get('category') ?? '';
  const collectionId = searchParams.get('collectionId') ?? '';
  const page         = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const pageSize     = 24;

  const AND: Record<string, unknown>[] = [];
  if (q)           AND.push({ OR: [{ title: { contains: q } }, { eventName: { contains: q } }, { location: { contains: q } }, { detectedTagsJson: { contains: q } }, { manualTagsJson: { contains: q } }] });
  if (type === 'image') AND.push({ fileType: { startsWith: 'image/' } });
  if (type === 'video') AND.push({ fileType: { startsWith: 'video/' } });
  if (seasonId)    AND.push({ seasonId });
  if (category)    AND.push({ category });
  if (collectionId) AND.push({ collectionId });

  const where = AND.length ? { AND } : {};

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({ where, orderBy: { uploadedAt: 'desc' }, take: pageSize, skip: (page - 1) * pageSize }),
    prisma.asset.count({ where }),
  ]);

  return NextResponse.json({ assets, total, page, pageSize, pages: Math.ceil(total / pageSize) });
}
