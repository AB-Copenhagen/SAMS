import { NextResponse } from 'next/server';
import { checkRateLimit, requestIp } from '../../../../lib/rate-limit';
import { applyShareFilters, getPublicCollectionByToken, resolveCollectionAssets, sanitizePublicAsset, verifySharePassword } from '../../../../lib/collections';
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

  const assets = applyShareFilters(await resolveCollectionAssets(collection), collection);
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

  const allowed = await checkRateLimit(`share_pw_attempts:${token}:${requestIp(request)}`, {
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    max: RATE_LIMIT_MAX_ATTEMPTS,
  });
  if (!allowed) {
    return NextResponse.json({ message: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const password = body?.password as string | undefined;
  if (!password || !verifySharePassword(password, collection.sharePasswordSalt, collection.sharePasswordHash)) {
    return NextResponse.json({ message: 'Incorrect password' }, { status: 401 });
  }

  const assets = applyShareFilters(await resolveCollectionAssets(collection), collection);
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
