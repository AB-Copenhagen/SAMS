export class SamsApi {
  constructor({ apiUrl, token }) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  async #fetch(pathname, init = {}) {
    const res = await fetch(`${this.apiUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`${pathname} failed (HTTP ${res.status}): ${body.message ?? res.statusText}`);
    }
    return res.json();
  }

  createSession({ fileName, fileType, fileSize, contentHash, channel, metadata }) {
    return this.#fetch('/api/ingest/sessions', {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType, fileSize, contentHash, channel, metadata }),
    });
  }

  getPartUrls(jobId, partNumbers) {
    return this.#fetch(`/api/ingest/sessions/${jobId}/parts?partNumbers=${partNumbers.join(',')}`);
  }

  completeSession(jobId, { parts, exifJson } = {}) {
    return this.#fetch(`/api/ingest/sessions/${jobId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ parts, exifJson }),
    });
  }

  abortSession(jobId) {
    return this.#fetch(`/api/ingest/sessions/${jobId}/abort`, { method: 'POST' });
  }

  getSession(jobId) {
    return this.#fetch(`/api/ingest/sessions/${jobId}`);
  }
}

export async function putToStorage(url, body, contentType) {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
  if (!res.ok) throw new Error(`Storage PUT failed (HTTP ${res.status})`);
  return res.headers.get('etag')?.replace(/"/g, '') ?? '';
}
