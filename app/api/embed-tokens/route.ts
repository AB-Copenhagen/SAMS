import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getOrCreateEmbedToken, collectionEmbeddable, type EmbedTargetType } from '../../../lib/collections';

function isTargetType(value: unknown): value is EmbedTargetType {
  return value === 'asset' || value === 'collection' || value === 'playlist';
}

// Self-serve per spec (.dmx/jobs/gh-123/spec.md) — any staff member with media-edit access can
// issue an embed link, same gate as the existing share-link PATCH in app/api/assets/[id] and
// app/api/collections/[id]. No separate admin-only step.

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!hasPermission(user, 'media', 'view')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get('targetType');
  const targetId = searchParams.get('targetId');
  if (!isTargetType(targetType) || !targetId) {
    return NextResponse.json({ message: 'targetType and targetId are required' }, { status: 400 });
  }

  const tokens = await prisma.embedToken.findMany({
    where: { targetType, targetId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { token: true, createdBy: true, createdAt: true },
  });
  return NextResponse.json({ tokens });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, 'media', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { targetType, targetId } = body as { targetType?: unknown; targetId?: unknown };
  if (!isTargetType(targetType) || typeof targetId !== 'string' || !targetId) {
    return NextResponse.json({ message: 'targetType and targetId are required' }, { status: 400 });
  }

  if (targetType === 'asset') {
    const asset = await prisma.asset.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!asset) return NextResponse.json({ message: 'Asset not found' }, { status: 404 });
  } else if (targetType === 'collection') {
    const collection = await prisma.collection.findUnique({ where: { id: targetId }, select: { sharePasswordHash: true } });
    if (!collection) return NextResponse.json({ message: 'Collection not found' }, { status: 404 });
    if (!collectionEmbeddable(collection)) {
      return NextResponse.json({ message: 'A password-protected collection cannot be embedded — remove the password first' }, { status: 409 });
    }
  } else {
    // Playlists have no password/visibility toggle of their own (unlike Collection) — nothing to
    // gate here beyond existing, same as resolveEmbedTarget's playlist branch not re-checking one.
    const playlist = await prisma.playlist.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!playlist) return NextResponse.json({ message: 'Playlist not found' }, { status: 404 });
  }

  const token = await getOrCreateEmbedToken(targetType, targetId, user.email);
  return NextResponse.json({ token });
}
