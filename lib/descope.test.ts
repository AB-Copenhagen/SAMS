import { describe, it, expect } from 'vitest';
import { resolveAppRole, isAllowedEmailDomain } from './descope';

describe('resolveAppRole', () => {
  it('resolves ADMIN when the Admin role is present', () => {
    expect(resolveAppRole(['Admin'])).toBe('ADMIN');
  });

  it('resolves STAFF when the Staff role is present', () => {
    expect(resolveAppRole(['Staff'])).toBe('STAFF');
  });

  it('prefers ADMIN over STAFF when both are present', () => {
    expect(resolveAppRole(['Staff', 'Admin'])).toBe('ADMIN');
  });

  it('falls back to USER instead of null for an empty role list', () => {
    expect(resolveAppRole([])).toBe('USER');
  });

  it('falls back to USER instead of null for an undefined role list', () => {
    expect(resolveAppRole(undefined)).toBe('USER');
  });

  it('falls back to USER for an unrecognized role name', () => {
    expect(resolveAppRole(['Player'])).toBe('USER');
  });
});

describe('isAllowedEmailDomain', () => {
  it('allows an @ab.dk email', () => {
    expect(isAllowedEmailDomain('person@ab.dk')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedEmailDomain('Person@AB.DK')).toBe(true);
  });

  it('rejects a non-ab.dk email', () => {
    expect(isAllowedEmailDomain('person@example.com')).toBe(false);
  });

  it('rejects a domain that merely contains ab.dk as a substring', () => {
    expect(isAllowedEmailDomain('person@notab.dk')).toBe(false);
  });
});
