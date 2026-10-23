// One-shot script: runs Shopify's OAuth install flow for a Partner-Dashboard app (Client
// ID/Secret, not a "custom app" direct token) and writes the resulting Admin API access token
// straight into .env.local. Needed because lib/shopify.ts calls the Admin API with a bearer
// access token, which a Client ID/Secret pair can't do on its own — this exchanges them for one.
//
// Prerequisite: in the Shopify Partner Dashboard, add this script's local callback URL to the
// app's "Allowed redirection URL(s)" — by default http://localhost:8734/shopify/callback (pass
// a different port as the second argument if you change it below, and update the dashboard to
// match). Without that, Shopify rejects the OAuth request before it ever reaches this script.
//
// Usage: node scripts/shopify-oauth-install.mjs <shop>.myshopify.com [port]

import { createServer } from 'http';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

const SCOPES = 'read_customers,read_orders';

const shop = process.argv[2];
const port = Number(process.argv[3] ?? 8734);
if (!shop) {
  console.error('Usage: node scripts/shopify-oauth-install.mjs <shop>.myshopify.com [port]');
  process.exit(1);
}

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
const clientId = env.SHOPIFY_APP_CLIENT_ID;
const clientSecret = env.SHOPIFY_APP_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET missing from .env.local');
  process.exit(1);
}

const redirectUri = `http://localhost:${port}/shopify/callback`;
const state = randomBytes(16).toString('hex');

function verifyHmac(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest).sort().map((key) => `${key}=${rest[key]}`).join('&');
  const expected = createHmac('sha256', clientSecret).update(message).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(hmac));
  } catch {
    return false;
  }
}

function updateEnvLocal(updates) {
  let text = readFileSync('.env.local', 'utf-8');
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}="${value}"`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, line) : `${text}\n${line}\n`;
  }
  writeFileSync('.env.local', text);
}

const authorizeUrl =
  `https://${shop}/admin/oauth/authorize?client_id=${clientId}` +
  `&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

console.log('\nOpen this URL in a browser where you can approve the app install on the AB store:\n');
console.log(authorizeUrl);
console.log(`\nWaiting for Shopify's redirect back to ${redirectUri} ...\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname !== '/shopify/callback') {
    res.writeHead(404).end();
    return;
  }

  const query = Object.fromEntries(url.searchParams.entries());

  if (query.state !== state) {
    res.writeHead(400).end('State mismatch — possible CSRF, aborting.');
    server.close();
    console.error('State mismatch — aborting without exchanging the code.');
    process.exit(1);
  }

  if (!verifyHmac(query)) {
    res.writeHead(400).end('HMAC verification failed — not a genuine Shopify callback.');
    server.close();
    console.error('HMAC verification failed — aborting without exchanging the code.');
    process.exit(1);
  }

  try {
    const tokenRes = await fetch(`https://${query.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: query.code }),
    });
    if (!tokenRes.ok) throw new Error(`${tokenRes.status} ${await tokenRes.text()}`);
    const { access_token: accessToken, scope } = await tokenRes.json();

    updateEnvLocal({ SHOPIFY_STORE_DOMAIN: query.shop, SHOPIFY_ADMIN_API_ACCESS_TOKEN: accessToken });

    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Success — you can close this tab.');
    console.log(`Installed on ${query.shop} with scope "${scope}".`);
    console.log('Wrote SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_ACCESS_TOKEN into .env.local.');
    console.log('Remember to also add these to the Vercel project\'s environment variables for preview/production.');
  } catch (err) {
    res.writeHead(500).end('Token exchange failed — see the terminal.');
    console.error('Token exchange failed:', err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(port);
