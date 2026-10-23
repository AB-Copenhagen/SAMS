import type { PrismaClient } from '@prisma/client';

// Call right before creating a new CustomerSyncRun for `source`. If the previous run for that
// source never reached success/error, it almost certainly wasn't still genuinely in progress —
// it was killed by the platform's function timeout, which is not a catchable JS error, so the
// route's own catch block never ran to record it. Left alone, that row would stay "running"
// forever and the dashboard's sync-health card (app/customers/page.tsx) would show a
// permanently ambiguous status instead of an honest "the last attempt didn't finish."
export async function supersedeStaleRun(db: PrismaClient, source: string): Promise<void> {
  await db.customerSyncRun.updateMany({
    where: { source, status: 'running' },
    data: {
      status: 'error',
      finishedAt: new Date(),
      errorMessage: 'Superseded by a new run — the previous run never reported back, most likely a function timeout',
    },
  });
}
