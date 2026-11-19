'use client';

import { useEffect } from 'react';
import type { User } from '../lib/auth';
import { identifyStaffUser, capturePageview } from '../lib/posthog';

export default function PostHogProvider({
  user,
  pathname,
  children,
}: {
  user: User;
  /** Deliberately pathname-only, not query string — useSearchParams() needs its own Suspense
   * boundary in the App Router, and nothing here needs query-string granularity yet (gh-120). */
  pathname: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    identifyStaffUser({ id: user.id, role: user.role });
  }, [user.id, user.role]);

  useEffect(() => {
    capturePageview();
  }, [pathname]);

  return <>{children}</>;
}
