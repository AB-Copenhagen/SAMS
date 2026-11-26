import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../../lib/auth';
import { revokeEmbedToken } from '../../../../lib/collections';

export async function DELETE(_: Request, props: { params: Promise<{ token: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, 'media', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { token } = await props.params;
  await revokeEmbedToken(token);
  return NextResponse.json({ ok: true });
}
