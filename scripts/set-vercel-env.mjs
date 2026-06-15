import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; })
);

const vars = [
  'NEXT_PUBLIC_DESCOPE_PROJECT_ID',
  'DESCOPE_SERVICE_ACCOUNT_KEY',
  'WASABI_REGION',
  'WASABI_BUCKET',
  'WASABI_ENDPOINT',
  'WASABI_ACCESS_KEY_ID',
  'WASABI_SECRET_ACCESS_KEY',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
];

for (const v of vars) {
  const val = env[v];
  if (!val) { console.log(`SKIP ${v} — not in .env.local`); continue; }

  const r = spawnSync('vercel', ['env', 'add', v, 'production', '--yes'], {
    input: val + '\n',
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const out = (r.stdout + r.stderr).toLowerCase();
  if (out.includes('added') || out.includes('updated') || out.includes('success')) {
    console.log(`OK   ${v}`);
  } else {
    console.log(`ERR  ${v}: ${(r.stdout + r.stderr).trim().slice(0, 120)}`);
  }
}
