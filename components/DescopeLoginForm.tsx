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
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? 'Sign in failed. Check your role permissions.');
    }
  }

  function handleError(e: Event) {
    console.error('Descope flow error', e);
    setError('An error occurred during sign in. Please try again.');
  }

  return (
    <>
      <Descope
        flowId="sign-in"
        onSuccess={handleSuccess}
        onError={handleError}
      />
      {error ? <div className="alert">{error}</div> : null}
    </>
  );
}
