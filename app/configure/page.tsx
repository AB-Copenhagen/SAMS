import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import AppShell from '../../components/AppShell';
import ConfigureClient from '../../components/ConfigureClient';

export default async function ConfigurePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Configure</h1>
          <p>Manage seasons, players, sponsors and stadiums.</p>
        </div>
      </div>
      <div className="card">
        <ConfigureClient />
      </div>
    </AppShell>
  );
}
