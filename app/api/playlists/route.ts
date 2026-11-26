import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../lib/auth';
import { createPlaylist, listPlaylists } from '../../../lib/playlists';

// Self-serve per spec (.dmx/jobs/gh-128/spec.md) — any staff member with media-edit access can
// create/manage a playlist, same gate as gh-123's embed-token issuance. No separate admin step.

export async function GET() {
  const user = await getCurrentUser();
  if (!hasPermission(user, 'media', 'view')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const playlists = await listPlaylists();
  return NextResponse.json({ playlists });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, 'media', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof (body as { name?: unknown }).name === 'string' ? (body as { name: string }).name.trim() : '';
  if (!name) return NextResponse.json({ message: 'name is required' }, { status: 400 });

  const playlist = await createPlaylist(name, user.email);
  return NextResponse.json(playlist);
}
