import posthog from 'posthog-js';

export type StaffIdentity = {
  id: string;
  role: string;
};

// Debug-only tooling (gh-115), not full-coverage analytics — sample a minority of staff
// sessions rather than recording every one.
const SESSION_RECORDING_SAMPLE_RATE = 0.1;

let client: typeof posthog | null = null;

function getClient(): typeof posthog | null {
  if (typeof window === 'undefined') return null;
  if (client) return client;

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token || !host) return null;

  posthog.init(token, {
    api_host: host,
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
      sampleRate: SESSION_RECORDING_SAMPLE_RATE,
    },
  });

  client = posthog;
  return client;
}

export function getPostHogClient(): typeof posthog | null {
  return getClient();
}

// capture_pageview stays false at init (gh-120) — Next.js App Router navigates client-side via
// the History API, so the built-in full-page-load pageview capture would miss most navigation.
// Callers fire this manually on route change instead (see PostHogProvider).
export function capturePageview(): void {
  getClient()?.capture('$pageview');
}

export function identifyStaffUser(identity: StaffIdentity): void {
  const instance = getClient();
  if (!instance) return;

  instance.identify(identity.id, { role: identity.role });

  // The PostHog project's own "record sessions" default is now off (gh-118) — it's shared with
  // the public www.ab.dk site, which isn't recorded. Force recording on for this staff-app
  // client explicitly rather than relying on that project default.
  instance.startSessionRecording();
}
