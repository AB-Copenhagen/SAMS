// SAMS's own staff login roster (gh-76) — see the StaffUser model in prisma/schema.prisma for
// why it's keyed by email rather than Descope userId.
import { prisma } from './db';
import type { StaffUser as PrismaStaffUser } from '@prisma/client';
import type { AppRole } from './descope';

export type StaffUserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export type StaffUserRecord = {
  email: string;
  role: AppRole;
  status: StaffUserStatus;
  descopeUserId: string | null;
  name: string | null;
  invitedBy: string | null;
  invitedAt: Date;
};

function toRecord(row: PrismaStaffUser): StaffUserRecord {
  return {
    email: row.email,
    role: row.role as AppRole,
    status: row.status as StaffUserStatus,
    descopeUserId: row.descopeUserId,
    name: row.name,
    invitedBy: row.invitedBy,
    invitedAt: row.invitedAt,
  };
}

// The login gate's whole decision, as one pure function: no row, or an explicitly SUSPENDED one,
// is rejected; PENDING and ACTIVE are both allowed in (PENDING just hasn't logged in before).
export function resolveLoginDecision(record: StaffUserRecord | null): { allowed: boolean; role?: AppRole } {
  if (!record || record.status === 'SUSPENDED') return { allowed: false };
  return { allowed: true, role: record.role };
}

export async function findStaffUserByEmail(email: string): Promise<StaffUserRecord | null> {
  const row = await prisma.staffUser.findUnique({ where: { email } });
  return row ? toRecord(row) : null;
}

// Call only after resolveLoginDecision has already allowed this login — by then status is
// guaranteed PENDING or ACTIVE (never SUSPENDED), so unconditionally setting ACTIVE is safe and
// covers both "first login" (PENDING -> ACTIVE) and "returning user" (ACTIVE -> ACTIVE, a no-op)
// in one call, while still refreshing descopeUserId/name.
export async function markActive(email: string, info: { descopeUserId: string; name?: string | null }): Promise<void> {
  await prisma.staffUser.update({
    where: { email },
    data: { status: 'ACTIVE', descopeUserId: info.descopeUserId, name: info.name ?? undefined },
  });
}

export async function listStaffUsers(): Promise<StaffUserRecord[]> {
  const rows = await prisma.staffUser.findMany({ orderBy: { invitedAt: 'desc' } });
  return rows.map(toRecord);
}

export async function inviteStaffUser(email: string, role: AppRole, invitedBy: string): Promise<StaffUserRecord> {
  const row = await prisma.staffUser.create({ data: { email, role, status: 'PENDING', invitedBy } });
  return toRecord(row);
}

export async function setStaffUserRole(email: string, role: AppRole): Promise<StaffUserRecord> {
  const row = await prisma.staffUser.update({ where: { email }, data: { role } });
  return toRecord(row);
}

export async function setStaffUserStatus(email: string, status: StaffUserStatus): Promise<StaffUserRecord> {
  const row = await prisma.staffUser.update({ where: { email }, data: { status } });
  return toRecord(row);
}
