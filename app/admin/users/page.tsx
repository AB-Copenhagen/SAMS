import { getCurrentUser, requirePermission } from '../../../lib/auth';
import { listStaffUsers } from '../../../lib/staff-users';
import AppShell from '../../../components/AppShell';
import UserRoleSelect from '../../../components/UserRoleSelect';
import StaffUserStatusSelect from '../../../components/StaffUserStatusSelect';
import InviteStaffUserForm from '../../../components/InviteStaffUserForm';

export default async function AdminUsersPage() {
  const user = requirePermission(await getCurrentUser(), 'adminSettings', 'edit');
  const users = await listStaffUsers();

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>SAMS's own login roster — invite anyone by email and assign their role.</p>
        </div>
      </div>

      <InviteStaffUserForm />

      <div className="card" style={{ padding: 0 }}>
        {users.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: '#8890b4' }}>
            No users yet. Invite someone above.
          </div>
        ) : (
          <div className="asset-table-wrap">
            <table className="asset-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.email}>
                    <td style={{ fontWeight: 500 }}>{u.name || '—'}</td>
                    <td>{u.email}</td>
                    <td>
                      <UserRoleSelect email={u.email} role={u.role} />
                    </td>
                    <td>
                      <StaffUserStatusSelect email={u.email} status={u.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
