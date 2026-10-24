// One-shot: registers this app's scan.created webhook with Vivenu and generates the hmacKey
// used to verify it (see lib/vivenu.ts's verifyVivenuSignature). Only needs to run once — vivenu
// webhooks aren't tied to a deploy, so this isn't part of the normal deploy flow.
//
// Usage: node scripts/vivenu-register-webhook.mjs

import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

function readEnvLocal() {
  return Object.fromEntries(
    readFileSync('.env.local', 'utf-8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const eq = l.indexOf('=');
        const key = l.slice(0, eq).trim();
        const value = l.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
        return [key, value];
      })
  );
}

const env = readEnvLocal();
const apiKey = env.VIVENU_API_KEY;
const baseUrl = (env.VIVENU_API_BASE_URL || 'https://vivenu.com/api').replace(/\/$/, '');
const appBaseUrl = env.APP_BASE_URL;

if (!apiKey) {
  console.error('VIVENU_API_KEY missing from .env.local');
  process.exit(1);
}
if (!appBaseUrl) {
  console.error('APP_BASE_URL missing from .env.local — needed to build the webhook URL vivenu will call');
  process.exit(1);
}

const hmacKey = randomBytes(32).toString('hex');
const webhookUrl = `${appBaseUrl.replace(/\/$/, '')}/api/webhooks/vivenu`;

const res = await fetch(`${baseUrl}/webhooks`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'SAMS customer attendance tracking',
    url: webhookUrl,
    enabled: true,
    hmacKey,
    // Only the events app/api/webhooks/vivenu actually handles — anything else would just be
    // silently ignored there, so there's no reason to subscribe to it.
    events: { 'scan.created': true },
  }),
});

if (!res.ok) {
  console.error(`Webhook registration failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const webhook = await res.json();
console.log(`Registered webhook ${webhook._id ?? '(id not returned)'} -> ${webhookUrl}`);

let text = readFileSync('.env.local', 'utf-8');
const line = `VIVENU_WEBHOOK_HMAC_KEY="${hmacKey}"`;
const pattern = /^VIVENU_WEBHOOK_HMAC_KEY=.*$/m;
text = pattern.test(text) ? text.replace(pattern, line) : `${text}\n${line}\n`;
writeFileSync('.env.local', text);

console.log('Wrote VIVENU_WEBHOOK_HMAC_KEY into .env.local.');
console.log('Add the same value to the Vercel project\'s environment variables for preview/production.');
