import { describe, it, expect } from 'vitest';
import { resolveLoginDecision, type StaffUserRecord } from './staff-users';

function record(status: StaffUserRecord['status'], role: StaffUserRecord['role'] = 'STAFF'): StaffUserRecord {
  return { email: 'u@example.com', role, status, descopeUserId: null, name: null, invitedBy: null, invitedAt: new Date() };
}

describe('resolveLoginDecision', () => {
  it('rejects when there is no roster row at all', () => {
    expect(resolveLoginDecision(null)).toEqual({ allowed: false });
  });

  it('rejects a SUSPENDED row', () => {
    expect(resolveLoginDecision(record('SUSPENDED'))).toEqual({ allowed: false });
  });

  it('allows a PENDING row, with its role', () => {
    expect(resolveLoginDecision(record('PENDING', 'ADMIN'))).toEqual({ allowed: true, role: 'ADMIN' });
  });

  it('allows an ACTIVE row, with its role', () => {
    expect(resolveLoginDecision(record('ACTIVE', 'USER'))).toEqual({ allowed: true, role: 'USER' });
  });
});
