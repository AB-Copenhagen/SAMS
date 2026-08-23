import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { generateShareToken, hashSharePassword } from '../../../../lib/collections';

const ASSET_PAGE_SIZE = 100;

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));

  const collection = await prisma.collection.findUnique({
    where: { id: params.id },
    include: {
      season: true,
      stadium: true,
      // Trimmed to the fields a gallery view actually renders (excludes large JSON blobs like
      // exifJson/detectedTagsJson/gcvResponseJson), and paginated rather than returning every
      // asset in the collection in one response.
      assets: {
        orderBy: { uploadedAt: 'desc' },
        take: ASSET_PAGE_SIZE,
        skip: (page - 1) * ASSET_PAGE_SIZE,
        select: {
          id: true, title: true, eventName: true, eventDate: true, location: true,
          fileType: true, fileSize: true, thumbnailKey: true, thumbnailStatus: true,
        },
      },
      playerRules: { include: { player: true } },
      sponsorRules: { include: { sponsor: true } },
      _count: { select: { assets: true } },
    },
  });
  if (!collection) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...collection, assetsTotal: collection._count.assets, page, pageSize: ASSET_PAGE_SIZE });
}

type PatchBody = {
  name?: string;
  date?: string | null;
  opponent?: string | null;
  venue?: string | null;
  isPublic?: boolean;
  password?: string | null; // string to set/change, null to clear, omit to leave unchanged
  regenerateToken?: boolean;
  shareMinRating?: number | null;
  shareDateRangeDays?: number | null;
};

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json() as PatchBody;

  const existing = await prisma.collection.findUnique({ where: { id: params.id }, select: { shareToken: true } });
  if (!existing) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  let passwordFields: { sharePasswordSalt: string | null; sharePasswordHash: string | null } | undefined;
  if (body.password === null) {
    passwordFields = { sharePasswordSalt: null, sharePasswordHash: null };
  } else if (typeof body.password === 'string' && body.password.length > 0) {
    const { salt, hash } = hashSharePassword(body.password);
    passwordFields = { sharePasswordSalt: salt, sharePasswordHash: hash };
  }

  const needsToken = (body.isPublic === true || body.regenerateToken) && (body.regenerateToken || !existing.shareToken);

  const collection = await prisma.collection.update({
    where: { id: params.id },
    data: {
      ...(body.name      !== undefined && { name: body.name }),
      ...(body.date      !== undefined && { date: body.date ? new Date(body.date) : null }),
      ...(body.opponent  !== undefined && { opponent: body.opponent || null }),
      ...(body.venue     !== undefined && { venue: body.venue || null }),
      ...(body.isPublic  !== undefined && { isPublic: body.isPublic }),
      ...(body.shareMinRating     !== undefined && { shareMinRating: body.shareMinRating }),
      ...(body.shareDateRangeDays !== undefined && { shareDateRangeDays: body.shareDateRangeDays }),
      ...(passwordFields && { ...passwordFields, shareUpdatedAt: new Date() }),
      ...(needsToken && { shareToken: generateShareToken() }),
    },
  });
  return NextResponse.json(collection);
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  await prisma.collection.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
