import { describe, it, expect } from 'vitest';
import { hasPermission, type Module, type PermissionAction, type User, type UserRole } from './auth';

function userWithRole(role: UserRole): User {
  return { id: 'u1', email: 'u1@ab.dk', role };
}

// The confirmed matrix from .dmx/jobs/gh-72/spec.md Question 1.
const EXPECTED: Record<Module, Record<'USER' | 'STAFF' | 'ADMIN', PermissionAction[]>> = {
  media: {
    USER: ['view', 'add', 'edit'],
    STAFF: ['view', 'add', 'edit', 'delete'],
    ADMIN: ['view', 'add', 'edit', 'delete'],
  },
  crm: {
    USER: [],
    STAFF: ['view'],
    ADMIN: ['view', 'edit', 'delete'],
  },
  adminSettings: {
    USER: [],
    STAFF: [],
    ADMIN: ['view', 'edit'],
  },
};

const ALL_ACTIONS: PermissionAction[] = ['view', 'add', 'edit', 'delete'];
const ALL_MODULES: Module[] = ['media', 'crm', 'adminSettings'];
const ALL_ROLES: ('USER' | 'STAFF' | 'ADMIN')[] = ['USER', 'STAFF', 'ADMIN'];

describe('hasPermission', () => {
  it('returns false for a null user regardless of module/action', () => {
    expect(hasPermission(null, 'media', 'view')).toBe(false);
  });

  for (const module of ALL_MODULES) {
    for (const role of ALL_ROLES) {
      for (const action of ALL_ACTIONS) {
        const expected = EXPECTED[module][role].includes(action);
        it(`${role} ${expected ? 'can' : 'cannot'} ${action} ${module}`, () => {
          expect(hasPermission(userWithRole(role), module, action)).toBe(expected);
        });
      }
    }
  }
});
