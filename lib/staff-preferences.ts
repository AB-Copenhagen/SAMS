import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from './db';

export type StaffPreferences = {
  theme: 'light' | 'dark' | null;
  defaultPageSize: number | null;
  defaultLandingPage: string | null;
};

const DEFAULTS: StaffPreferences = { theme: null, defaultPageSize: null, defaultLandingPage: null };

function tagFor(userId: string): string {
  return `staff-pref:${userId}`;
}

// Read on most admin pages (for the default-page-size/default-landing-page fallbacks) but
// changes rarely — cache per user like lib/lookup-cache.ts caches the shared lookup tables, with
// a longer 300s revalidate since this is per-user rather than shared across every request.
// invalidateStaffPreference() below is called by the write route so a saved change is visible
// on the next navigation rather than waiting out the TTL.
export async function getCachedStaffPreferences(userId: string): Promise<StaffPreferences> {
  const load = unstable_cache(
    async (): Promise<StaffPreferences> => {
      const row = await prisma.staffPreference.findUnique({ where: { id: userId } });
      if (!row) return DEFAULTS;
      const theme: StaffPreferences['theme'] = row.theme === 'light' || row.theme === 'dark' ? row.theme : null;
      return {
        theme,
        defaultPageSize: row.defaultPageSize ?? null,
        defaultLandingPage: row.defaultLandingPage ?? null,
      };
    },
    ['staff-pref', userId],
    { tags: [tagFor(userId)], revalidate: 300 },
  );
  return load();
}

export function invalidateStaffPreference(userId: string): void {
  revalidateTag(tagFor(userId), { expire: 300 });
}

// Same set already used by app/collections/page.tsx and app/media/page.tsx's PER_PAGE_OPTIONS —
// reuse it here rather than letting the preference introduce a page size no selector offers.
export const PAGE_SIZE_OPTIONS = [25, 50, 100];

export function resolvePageSize(pref: StaffPreferences, fallback: number): number {
  return pref.defaultPageSize && PAGE_SIZE_OPTIONS.includes(pref.defaultPageSize) ? pref.defaultPageSize : fallback;
}

// Fixed allowlist, not whatever the client sends — defaultLandingPage feeds directly into a
// redirect() call, so an unvalidated value would be an open-redirect risk (see security-checklist
// skill). Validated again here at read time (not just on save) in case a role changed after the
// preference was set.
export const LANDING_PAGE_CHOICES: { value: string; label: string; adminOnly?: boolean }[] = [
  { value: '/home', label: 'Home' },
  { value: '/upload', label: 'Upload' },
  { value: '/media', label: 'Media library' },
  { value: '/collections', label: 'Collections' },
  { value: '/customers', label: 'Customers', adminOnly: true },
  { value: '/jobs', label: 'Jobs', adminOnly: true },
  { value: '/analytics', label: 'Analytics', adminOnly: true },
];

export function resolveLandingPage(pref: StaffPreferences, role: string, fallback: string): string {
  const choice = LANDING_PAGE_CHOICES.find((c) => c.value === pref.defaultLandingPage);
  if (!choice) return fallback;
  if (choice.adminOnly && role !== 'ADMIN') return fallback;
  return choice.value;
}
