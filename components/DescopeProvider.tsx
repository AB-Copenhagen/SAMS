'use client';

import { AuthProvider } from '@descope/react-sdk';

export default function DescopeProvider({ children }: { children: React.ReactNode }) {
  const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;
  if (!projectId) return <>{children}</>;
  return <AuthProvider projectId={projectId}>{children}</AuthProvider>;
}
