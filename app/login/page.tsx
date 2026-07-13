import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import DescopeLoginForm from '../../components/DescopeLoginForm';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/upload');

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/AB1889.png" alt="AB Copenhagen" className="login-logo-mark" />
          <div>
            <div className="login-title">AB Media</div>
            <div className="login-subtitle">Digital Asset Manager</div>
          </div>
        </div>
        <DescopeLoginForm />
      </div>
    </div>
  );
}
