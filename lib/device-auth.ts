import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { prisma } from './db';
import type { User } from './auth';

const TOKEN_PREFIX = 'sams_dev_';

function base62(bytes: Buffer): string {
  return bytes.toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, bytes.length);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface MintedDeviceKey {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
}

export function mintDeviceKey(): MintedDeviceKey {
  const prefix = base62(randomBytes(9));
  const secret = base62(randomBytes(24));
  const rawKey = `${TOKEN_PREFIX}${prefix}_${secret}`;
  return { rawKey, keyPrefix: prefix, keyHash: sha256Hex(secret) };
}

export interface DeviceActor {
  id: string;
  email: string;
  role: User['role'];
  deviceId: string;
}

export async function verifyDeviceKey(rawKey: string): Promise<DeviceActor | null> {
  if (!rawKey.startsWith(TOKEN_PREFIX)) return null;

  const rest = rawKey.slice(TOKEN_PREFIX.length);
  const sep = rest.indexOf('_');
  if (sep === -1) return null;

  const prefix = rest.slice(0, sep);
  const secret = rest.slice(sep + 1);
  if (!prefix || !secret) return null;

  const device = await prisma.deviceCredential.findUnique({ where: { keyPrefix: prefix } });
  if (!device || device.revokedAt) return null;

  const expected = Buffer.from(device.keyHash, 'hex');
  const actual = Buffer.from(sha256Hex(secret), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  prisma.deviceCredential.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return {
    id: device.id,
    email: device.ownerEmail,
    role: device.role as User['role'],
    deviceId: device.id,
  };
}

export async function getIngestActor(request: Request): Promise<(User & { deviceId?: string }) | null> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const device = await verifyDeviceKey(authHeader.slice('Bearer '.length).trim());
    if (!device) return null;
    return { id: device.id, email: device.email, role: device.role, deviceId: device.deviceId };
  }

  const { getCurrentUser } = await import('./auth');
  return getCurrentUser();
}
