import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../../lib/auth';
import MobileIngestForm from '../../../components/MobileIngestForm';

export default async function MobileIngestPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Field capture</h1>
        <p style={{ margin: '4px 0 0', color: '#8890b4', fontSize: 13 }}>
          Signed in as {user.name ?? user.email} · <Link href="/upload">Desktop upload →</Link>
        </p>
      </div>
      <MobileIngestForm />
    </div>
  );
}
