import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import AppShell from '../../components/AppShell';
import BulkUploadZone from '../../components/BulkUploadZone';
import LiveIngestPanel from '../../components/LiveIngestPanel';

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Upload Assets</h1>
          <p>Drag &amp; drop photos or videos, or browse files and folders.</p>
        </div>
      </div>
      <BulkUploadZone />
      <LiveIngestPanel />
    </AppShell>
  );
}
