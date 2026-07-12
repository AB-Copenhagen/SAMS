import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const LEDGER_FILENAME = '.sams-ingest-state.json';

export function ledgerPathFor(folder) {
  return path.join(folder, LEDGER_FILENAME);
}

export function loadLedger(folder) {
  const file = ledgerPathFor(folder);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveLedger(folder, ledger) {
  writeFileSync(ledgerPathFor(folder), JSON.stringify(ledger, null, 2));
}

export function ledgerKey(filePath, size, mtimeMs) {
  return `${filePath}:${size}:${Math.floor(mtimeMs)}`;
}
