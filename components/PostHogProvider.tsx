'use client';

import { useEffect } from 'react';
import type { User } from '../lib/auth';
import { identifyStaffUser } from '../lib/posthog';

export default function PostHogProvider({ user, children }: { user: User; children: React.ReactNode }) {
  useEffect(() => {
    identifyStaffUser({ id: user.id, role: user.role });
  }, [user.id, user.role]);

  return <>{children}</>;
}
