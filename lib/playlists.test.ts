import { describe, it, expect } from 'vitest';
import { assetIsPlaylistEligible } from './playlists';

describe('assetIsPlaylistEligible', () => {
  it('accepts a video asset', () => {
    expect(assetIsPlaylistEligible({ fileType: 'video/mp4' })).toBe(true);
  });

  it('rejects an image asset', () => {
    expect(assetIsPlaylistEligible({ fileType: 'image/jpeg' })).toBe(false);
  });

  it('rejects any other file type', () => {
    expect(assetIsPlaylistEligible({ fileType: 'application/pdf' })).toBe(false);
  });
});
