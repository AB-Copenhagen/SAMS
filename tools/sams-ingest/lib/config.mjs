import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CONFIG_PATH = path.join(homedir(), '.sams-ingest', 'config.json');

function loadConfigFile() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

// Precedence: CLI flags > environment variables > ~/.sams-ingest/config.json
export function resolveConfig(flags) {
  const file = loadConfigFile();

  const apiUrl = flags.apiUrl || process.env.SAMS_API_URL || file.apiUrl;
  const token = flags.token || process.env.SAMS_DEVICE_TOKEN || file.token;

  if (!apiUrl) throw new Error('No API URL configured. Pass --api-url, set SAMS_API_URL, or add "apiUrl" to ~/.sams-ingest/config.json');
  if (!token) throw new Error('No device token configured. Pass --token, set SAMS_DEVICE_TOKEN, or add "token" to ~/.sams-ingest/config.json (mint one in SAMS under Configure → Devices)');

  return { apiUrl: apiUrl.replace(/\/$/, ''), token };
}
