import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: adds the index backing the scan.created webhook's per-check-in lookup
// (`db.customer.findFirst({ where: { vivenuCustomerId } })` in app/api/webhooks/vivenu/route.ts),
// which was otherwise a full Customer table scan on every single check-in. Safe to call more
// than once — CREATE INDEX IF NOT EXISTS.
//   fetch('/api/system/add-vivenu-customer-id-index', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Customer_vivenuCustomerId_idx" ON "Customer"("vivenuCustomerId")`,
  );

  return NextResponse.json({ ok: true });
}
