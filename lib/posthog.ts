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

export function identifyStaffUser(identity: StaffIdentity): void {
  getClient()?.identify(identity.id, { role: identity.role });
}
