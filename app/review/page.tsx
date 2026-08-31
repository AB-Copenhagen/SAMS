import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import { getCachedPlayers, getCachedSponsors, getCachedSeasons } from '../../lib/lookup-cache';
import AppShell from '../../components/AppShell';
import ReviewWorkflowClient from '../../components/ReviewWorkflowClient';

export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [allPlayers, allSponsors, seasons, collections] = await Promise.all([
    getCachedPlayers(),
    getCachedSponsors(),
    getCachedSeasons(),
    prisma.collection.findMany({ orderBy: { date: 'desc' }, select: { id: true, name: true, type: true, date: true, seasonId: true } }),
  ]);
  const players = allPlayers.filter((p) => p.active);
  const sponsors = allSponsors.filter((s) => s.active);

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Review</h1>
          <p>Confirm player/sponsor tags, season/match, and rate photo quality.</p>
        </div>
      </div>

      <ReviewWorkflowClient
        playerOptions={players.map((p) => ({ id: p.id, label: p.name + (p.number != null ? ` #${p.number}` : '') }))}
        sponsorOptions={sponsors.map((s) => ({ id: s.id, label: s.name }))}
        seasons={seasons}
        collections={collections}
      />
    </AppShell>
  );
}
