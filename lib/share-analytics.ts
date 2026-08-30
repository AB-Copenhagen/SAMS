import { createHmac } from 'crypto';
import { prisma } from './db';

// Pepper reuses SESSION_SECRET rather than a dedicated env var — we're not trying to survive a
// secret rotation without losing history, just avoiding raw IPs at rest.
function hashIp(ip: string): string | undefined {
  const secret = process.env.SESSION_SECRET;
  if (!secret || ip === 'unknown') return undefined;
  return createHmac('sha256', secret).update(ip).digest('hex');
}

type ShareEventInput = {
  kind: 'view' | 'download';
  token: string;
  collectionId?: string | null;
  assetId?: string | null;
  ip: string;
  userAgent?: string | null;
};

// Best-effort — a logging failure should never break a public share page load or download.
export async function logShareEvent(input: ShareEventInput): Promise<void> {
  try {
    await prisma.shareEvent.create({
      data: {
        kind: input.kind,
        token: input.token,
        collectionId: input.collectionId ?? null,
        assetId: input.assetId ?? null,
        ipHash: hashIp(input.ip),
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      },
    });
  } catch (err) {
    console.error('[share-analytics] failed to log event', err);
  }
}
