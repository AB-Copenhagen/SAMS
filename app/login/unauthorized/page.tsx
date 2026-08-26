import Link from 'next/link';

export default function LoginUnauthorizedPage() {
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
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Not authorized</h1>
        <p style={{ fontSize: 13, color: '#8890b4', marginBottom: 20 }}>
          Your account doesn&apos;t have access to media.ab.dk. If you think this is a mistake,
          contact an administrator to be granted the Admin or Staff role in Descope.
        </p>
        <Link className="btn-secondary" href="/login">Back to sign in</Link>
      </div>
    </div>
  );
}
