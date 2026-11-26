import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../../lib/auth';
import { getPlaylistWithItems, renamePlaylist, deletePlaylist } from '../../../../lib/playlists';

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!hasPermission(user, 'media', 'view')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const playlist = await getPlaylistWithItems(params.id);
  if (!playlist) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(playlist);
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, 'media', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof (body as { name?: unknown }).name === 'string' ? (body as { name: string }).name.trim() : '';
  if (!name) return NextResponse.json({ message: 'name is required' }, { status: 400 });

  await renamePlaylist(params.id, name);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, 'media', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  await deletePlaylist(params.id);
  return NextResponse.json({ ok: true });
}
