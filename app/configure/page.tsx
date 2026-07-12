import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';
import ConfigureClient from '../../components/ConfigureClient';
import MatchImportClient from '../../components/MatchImportClient';

export default async function ConfigurePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const seasons = await prisma.season.findMany({
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true },
  });

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Configure</h1>
          <p>Manage seasons, players, sponsors and stadiums.</p>
        </div>
      </div>
      <div className="card">
        <ConfigureClient showDevices={isAdmin(user)} />
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <MatchImportClient seasons={seasons} />
      </div>
    </AppShell>
  );
}
