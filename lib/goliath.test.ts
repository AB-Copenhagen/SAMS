import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUserProfile } from './goliath';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

describe('getUserProfile', () => {
  beforeEach(() => {
    vi.stubEnv('GOLIATH_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('parses lastActiveAt from a real profile response', async () => {
    mockFetchOnce(200, { id: 'u1', lastActiveAt: '2026-10-26T20:36:32.219Z', email: 'a@b.dk' });
    const profile = await getUserProfile('u1');
    expect(profile?.lastActiveAt).toEqual(new Date('2026-10-26T20:36:32.219Z'));
  });

  it('returns null lastActiveAt when the field is absent', async () => {
    mockFetchOnce(200, { id: 'u1', email: 'a@b.dk' });
    const profile = await getUserProfile('u1');
    expect(profile?.lastActiveAt).toBeNull();
  });

  it('returns null (not an error) on a 404', async () => {
    mockFetchOnce(404, { message: 'Not Found' });
    const profile = await getUserProfile('missing-user');
    expect(profile).toBeNull();
  });

  it('throws on a non-404 error status', async () => {
    mockFetchOnce(500, { message: 'Internal Server Error' });
    await expect(getUserProfile('u1')).rejects.toThrow(/500/);
  });
});
