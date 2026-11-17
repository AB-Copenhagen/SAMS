import { describe, it, expect } from 'vitest';
import { computeSnapshotCounts } from './descope-user-snapshot';

describe('computeSnapshotCounts', () => {
  it('treats every id as added when there is no prior snapshot (first run)', () => {
    const today = new Set(['a', 'b', 'c']);
    expect(computeSnapshotCounts(today, null)).toEqual({ totalCount: 3, addedCount: 3, lostCount: 0 });
  });

  it('reports no added/lost when the id set is unchanged', () => {
    const ids = new Set(['a', 'b', 'c']);
    expect(computeSnapshotCounts(ids, new Set(ids))).toEqual({ totalCount: 3, addedCount: 0, lostCount: 0 });
  });

  it('computes added and lost against the prior snapshot', () => {
    const previous = new Set(['a', 'b', 'c']);
    const today = new Set(['b', 'c', 'd', 'e']); // lost "a", added "d" and "e"
    expect(computeSnapshotCounts(today, previous)).toEqual({ totalCount: 4, addedCount: 2, lostCount: 1 });
  });

  it('handles today being empty', () => {
    const previous = new Set(['a', 'b']);
    expect(computeSnapshotCounts(new Set(), previous)).toEqual({ totalCount: 0, addedCount: 0, lostCount: 2 });
  });
});
