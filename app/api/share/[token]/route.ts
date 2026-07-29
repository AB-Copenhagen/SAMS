import { NextResponse } from 'next/server';
import { redis } from '../../../../lib/redis';
import { getPublicCollectionByToken, resolveCollectionAssets, sanitizePublicAsset, verifySharePassword } from '../../../../lib/collections';
import { createShareUnlockCookieValue, isShareUnlocked, shareUnlockCookieName } from '../../../../lib/share-auth';

const RATE_LIMIT_WINDOW_SECONDS = 600;
const RATE_LIMIT_MAX_ATTEMPTS = 8;

export async function GET(_: Request, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  const collection = await getPublicCollectionByToken(token);
  if (!collection || !collection.isPublic) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  if (collection.sharePasswordHash && !(await isShareUnlocked(token))) {
    return NextResponse.json({ passwordRequired: true, name: collection.name });
  }

  const assets = await resolveCollectionAssets(collection);
  return NextResponse.json({
    passwordRequired: false,
    name: collection.name,
    id: collection.id,
    assets: assets.map(sanitizePublicAsset),
  });
}

export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  const collection = await getPublicCollectionByToken(token);
  if (!collection || !collection.isPublic) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  if (!collection.sharePasswordHash || !collection.sharePasswordSalt) {
    return NextResponse.json({ message: 'This link has no password' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimitKey = `share_pw_attempts:${token}:${ip}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
  if (attempts > RATE_LIMIT_MAX_ATTEMPTS) {
    return NextResponse.json({ message: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const password = body?.password as string | undefined;
  if (!password || !verifySharePassword(password, collection.sharePasswordSalt, collection.sharePasswordHash)) {
    return NextResponse.json({ message: 'Incorrect password' }, { status: 401 });
  }

  const assets = await resolveCollectionAssets(collection);
  const response = NextResponse.json({
    passwordRequired: false,
    name: collection.name,
    id: collection.id,
    assets: assets.map(sanitizePublicAsset),
  });
  response.cookies.set({
    name: shareUnlockCookieName(token),
    value: createShareUnlockCookieValue(token),
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24,
  });
  return response;
}
