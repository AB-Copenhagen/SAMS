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
      throw httpError(`${pathname} failed (HTTP ${res.status}): ${body.message ?? res.statusText}`, res.status, 'api');
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

  // With `error`, the job is recorded as failed with that reason instead of aborted.
  abortSession(jobId, error) {
    return this.#fetch(`/api/ingest/sessions/${jobId}/abort`, {
      method: 'POST',
      ...(error ? { body: JSON.stringify({ error }) } : {}),
    });
  }

  reportProgress(jobId, partsCompleted) {
    return this.#fetch(`/api/ingest/sessions/${jobId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ partsCompleted }),
    });
  }

  getSession(jobId) {
    return this.#fetch(`/api/ingest/sessions/${jobId}`);
  }
}

export async function putToStorage(url, body, contentType) {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
  if (!res.ok) throw httpError(`Storage PUT failed (HTTP ${res.status})`, res.status, 'storage');
  return res.headers.get('etag')?.replace(/"/g, '') ?? '';
}

function httpError(message, status, source) {
  return Object.assign(new Error(message), { status, source });
}
