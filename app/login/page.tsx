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
          <div className="login-logo-mark">AB</div>
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
