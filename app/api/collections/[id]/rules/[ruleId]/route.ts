import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/db';

// ruleId may belong to either rule table — deleteMany on both is a harmless no-op for the one
// that doesn't match, so the caller doesn't need to know which kind it's removing.
export async function DELETE(_: Request, props: { params: Promise<{ id: string; ruleId: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  await Promise.all([
    prisma.collectionPlayerRule.deleteMany({ where: { id: params.ruleId, collectionId: params.id } }),
    prisma.collectionSponsorRule.deleteMany({ where: { id: params.ruleId, collectionId: params.id } }),
  ]);
  return NextResponse.json({ success: true });
}
