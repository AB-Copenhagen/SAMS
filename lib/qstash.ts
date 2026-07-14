import { Client, Receiver } from '@upstash/qstash';

// Mirrors the ingest cron's max-attempts cap (1 initial attempt + 4 retries = 5 total).
const DEFAULT_RETRIES = 4;

function baseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) throw new Error('APP_BASE_URL is not set');
  return url.replace(/\/$/, '');
}

// Enqueues a job for asynchronous processing via QStash. If QSTASH_TOKEN isn't configured (e.g.
// local dev, or before the Upstash QStash project is wired up), this logs and no-ops rather than
// throwing — the asset is still created successfully, and the reconciliation cron sweep in
// process-ingest-jobs picks up anything that never got enqueued.
export async function publishJob(path: string, body: unknown, retries = DEFAULT_RETRIES): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    console.warn(`[qstash] QSTASH_TOKEN not set — skipping enqueue of ${path}; the reconciliation sweep will pick it up`);
    return;
  }

  const client = new Client({ token });
  await client.publishJSON({
    url: `${baseUrl()}${path}`,
    body,
    retries,
    failureCallback: `${baseUrl()}/api/jobs/failed`,
  });
}

// Verifies the Upstash-Signature header on an incoming QStash callback. If no signing key is
// configured (local dev), verification is skipped and the request is trusted — same "optional
// secret, trusted if unset" convention already used for CRON_SECRET in the ingest cron.
export async function verifyQstashSignature(request: Request, rawBody: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey) return true;

  const signature = request.headers.get('upstash-signature');
  if (!signature) return false;

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  try {
    return await receiver.verify({ signature, body: rawBody });
  } catch {
    return false;
  }
}
