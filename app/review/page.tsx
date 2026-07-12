import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';
import ReviewWorkflowClient from '../../components/ReviewWorkflowClient';

export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [players, sponsors] = await Promise.all([
    prisma.player.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, number: true } }),
    prisma.sponsor.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Review</h1>
          <p>Confirm player/sponsor tags and rate photo quality.</p>
        </div>
      </div>

      <ReviewWorkflowClient
        playerOptions={players.map((p) => ({ id: p.id, label: p.name + (p.number != null ? ` #${p.number}` : '') }))}
        sponsorOptions={sponsors.map((s) => ({ id: s.id, label: s.name }))}
      />
    </AppShell>
  );
}
