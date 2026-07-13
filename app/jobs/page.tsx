import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '../../lib/auth';
import AppShell from '../../components/AppShell';
import JobsClient from '../../components/JobsClient';

export default async function JobsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) redirect('/home');

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Jobs</h1>
          <p>Player/sponsor tagging and thumbnail queue status, plus cron run history.</p>
        </div>
      </div>
      <JobsClient />
    </AppShell>
  );
}
