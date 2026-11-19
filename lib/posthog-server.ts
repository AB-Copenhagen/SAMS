import { PostHog } from 'posthog-node';
import { redactError, redactErrorMessage } from './posthog-redact';

// Reuses the same EU-hosted PostHog project as lib/posthog.ts (gh-115/gh-118) — posthog-js is a
// browser SDK and isn't meant to run in Node/serverless route handlers, hence the separate
// posthog-node client here rather than sharing lib/posthog.ts's instance.
let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token || !host) return null;

  client = new PostHog(token, { host });
  return client;
}

// `captureExceptionImmediate` (not the batched `captureException`) because a serverless
// function's runtime can freeze right after this route returns, before a background flush runs.
// Never throws — a capture failure shouldn't turn into a second error on top of the original one.
export async function captureServerException(error: unknown, context?: Record<string, unknown>): Promise<void> {
  const instance = getClient();
  if (!instance) return;

  const normalized = error instanceof Error ? redactError(error) : new Error(redactErrorMessage(String(error)));

  try {
    await instance.captureExceptionImmediate(normalized, context ? { properties: context } : undefined);
  } catch {
    // swallow — see function comment above
  }
}
