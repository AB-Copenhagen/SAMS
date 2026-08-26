'use client';

// Descope flow component uses customElements.define() — browser-only API.
// next/dynamic with ssr:false prevents it from being rendered server-side.
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const Descope = dynamic(
  () => import('@descope/react-sdk').then((mod) => mod.Descope),
  { ssr: false, loading: () => <p>Loading sign-in…</p> }
);

export default function DescopeLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSuccess(e: Event) {
    const sessionJwt = ((e as CustomEvent).detail as { sessionJwt?: string })?.sessionJwt;
    if (!sessionJwt) {
      setError('No session token received from Descope.');
      return;
    }

    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: sessionJwt }),
    });

    if (res.ok) {
      router.push('/upload');
    } else if (res.status === 403) {
      router.push('/login/unauthorized');
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? 'Sign in failed. Please try again.');
    }
  }

  // The Descope flow itself (not our backend) fires this for a hard failure — e.g. the loginId
  // doesn't match any user — rather than a per-field validation error the widget shows inline.
  // Treated the same as our own 403: this is an access/identity problem, not a transient one, so
  // send the user to a clear terminal page instead of leaving the flow hung with a one-line error.
  function handleError(e: Event) {
    console.error('Descope flow error', e);
    router.push('/login/unauthorized');
  }

  return (
    <>
      <Descope
        flowId="si-app"
        onSuccess={handleSuccess}
        onError={handleError}
      />
      {error ? <div className="alert alert-error">{error}</div> : null}
    </>
  );
}
