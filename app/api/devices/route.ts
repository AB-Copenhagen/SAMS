import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { mintDeviceKey } from '../../../lib/device-auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const devices = await prisma.deviceCredential.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, keyPrefix: true, ownerEmail: true, role: true,
      lastUsedAt: true, revokedAt: true, createdAt: true,
      _count: { select: { ingestJobs: true } },
    },
  });
  return NextResponse.json(devices);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ message: 'name is required' }, { status: 400 });

  const { rawKey, keyPrefix, keyHash } = mintDeviceKey();

  const device = await prisma.deviceCredential.create({
    data: {
      name,
      keyPrefix,
      keyHash,
      ownerEmail: user!.email,
      role: body?.role || 'MEDIA',
    },
  });

  // rawKey is only ever returned here — never persisted or shown again
  return NextResponse.json({ ...device, rawKey });
}
