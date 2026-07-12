#!/usr/bin/env node
import { watch, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveConfig } from '../lib/config.mjs';
import { SamsApi } from '../lib/api.mjs';
import { loadLedger, saveLedger, ledgerKey } from '../lib/ledger.mjs';
import { isSupportedMediaFile } from '../lib/mime.mjs';
import { ingestOneFile } from '../lib/uploader.mjs';

function toCamelCase(key) {
  return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseArgs(argv) {
  const [command, folder, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const key = toCamelCase(arg.slice(2));
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) { flags[key] = true; }
    else { flags[key] = next; i++; }
  }
  return { command, folder, flags };
}

function buildMetadata(flags) {
  return {
    eventName: flags.event,
    eventDate: flags.date,
    location: flags.location,
    seasonId: flags.season,
    collectionId: flags.collection,
    manualTags: flags.tags ? flags.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
  };
}

async function waitUntilStable(filePath, { checks = 3, intervalMs = 1000 } = {}) {
  let lastSize = -1;
  for (let i = 0; i < checks; i++) {
    let size;
    try { size = statSync(filePath).size; } catch { return false; } // file disappeared/still being created
    if (size === lastSize && size > 0) return true;
    lastSize = size;
    await delay(intervalMs);
  }
  return true;
}

function walk(folder) {
  const out = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && isSupportedMediaFile(full)) out.push(full);
  }
  return out;
}

async function processFile(api, filePath, channel, metadata, ledger, folder) {
  const stat = statSync(filePath);
  const key = ledgerKey(filePath, stat.size, stat.mtimeMs);
  if (ledger[key]) {
    console.log(`skip (already ingested): ${filePath}`);
    return;
  }

  try {
    const result = await ingestOneFile(
      api, filePath, { channel, metadata },
      (phase, progress) => {
        if (phase === 'uploading' && progress) {
          process.stdout.write(`\r  ${path.basename(filePath)}: uploading part ${progress.done}/${progress.total}   `);
        } else {
          process.stdout.write(`\r  ${path.basename(filePath)}: ${phase}...                              `);
        }
      },
    );
    process.stdout.write('\n');

    if (result.status === 'duplicate') {
      console.log(`duplicate, skipped: ${filePath} (existing asset ${result.existingAssetId})`);
      ledger[key] = { status: 'duplicate', assetId: result.existingAssetId };
    } else {
      console.log(`done: ${filePath} -> asset ${result.assetId}`);
      ledger[key] = { status: 'confirmed', assetId: result.assetId };
    }
    saveLedger(folder, ledger);
  } catch (err) {
    console.error(`FAILED: ${filePath}: ${err.message}`);
  }
}

async function cmdImport(folder, flags) {
  const config = resolveConfig(flags);
  const api = new SamsApi(config);
  const channel = flags.channel || 'hdd';
  const metadata = buildMetadata(flags);
  const concurrency = parseInt(flags.concurrency, 10) || 4;

  const ledger = loadLedger(folder);
  const files = walk(folder);
  console.log(`Found ${files.length} media file(s) under ${folder}`);

  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const filePath = files[cursor++];
      await processFile(api, filePath, channel, metadata, ledger, folder);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  console.log('Import complete.');
}

async function cmdWatch(folder, flags) {
  const config = resolveConfig(flags);
  const api = new SamsApi(config);
  const channel = flags.channel || 'dslr';
  const metadata = buildMetadata(flags);
  const ledger = loadLedger(folder);

  console.log(`Watching ${folder} for new files (channel: ${channel})... Ctrl+C to stop.`);

  const pending = new Set();
  async function handle(filePath) {
    if (pending.has(filePath)) return;
    pending.add(filePath);
    try {
      if (!isSupportedMediaFile(filePath)) return;
      const stable = await waitUntilStable(filePath);
      if (!stable) return;
      await processFile(api, filePath, channel, metadata, ledger, folder);
    } finally {
      pending.delete(filePath);
    }
  }

  // Pick up anything already sitting in the folder before we started watching.
  for (const filePath of walk(folder)) handle(filePath);

  watch(folder, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    handle(path.join(folder, filename));
  });

  await new Promise(() => {}); // run until Ctrl+C
}

async function main() {
  const { command, folder, flags } = parseArgs(process.argv.slice(2));

  if (!command || !folder || flags.help) {
    console.log(`
sams-ingest — bulk/realtime ingest into SAMS from a watched folder or a drive.

Usage:
  sams-ingest watch <folder> [options]    Watch a folder and ingest new files as they land
                                           (e.g. a DSLR tethering app's "save to" folder).
  sams-ingest import <folder> [options]   Recursively ingest every media file already in a
                                           folder (e.g. a mounted hard drive's DCIM folder).

Options:
  --api-url <url>       SAMS base URL (or set SAMS_API_URL / ~/.sams-ingest/config.json)
  --token <token>        Device key (or set SAMS_DEVICE_TOKEN / ~/.sams-ingest/config.json)
  --channel <name>       'dslr' | 'hdd' | 'mobile' (default: dslr for watch, hdd for import)
  --event <name>         Batch metadata: event name
  --date <YYYY-MM-DD>    Batch metadata: event date
  --location <text>      Batch metadata: location
  --season <id>          Batch metadata: season ID
  --collection <id>      Batch metadata: collection ID
  --tags <a,b,c>         Batch metadata: comma-separated tags
  --concurrency <n>      import mode only — parallel uploads (default 4)
`);
    process.exit(command ? 0 : 1);
  }

  if (command === 'watch') await cmdWatch(folder, flags);
  else if (command === 'import') await cmdImport(folder, flags);
  else { console.error(`Unknown command: ${command}`); process.exit(1); }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
