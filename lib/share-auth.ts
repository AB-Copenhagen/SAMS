import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

const UNLOCK_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return secret;
}

export function shareUnlockCookieName(token: string): string {
  return `dam_share_${token}`;
}

export function createShareUnlockCookieValue(token: string): string {
  const payload = Buffer.from(JSON.stringify({ token, exp: Date.now() + UNLOCK_TTL_MS })).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyShareUnlockValue(token: string, value: string | undefined): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot === -1) return false;

  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac('sha256', getSecret()).update(payload).digest('base64url');

  try {
    if (!timingSafeEqual(Buffer.from(sig, 'ascii'), Buffer.from(expected, 'ascii'))) return false;
  } catch {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { token: string; exp: number };
    return parsed.token === token && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export async function isShareUnlocked(token: string): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyShareUnlockValue(token, cookieStore.get(shareUnlockCookieName(token))?.value);
}
