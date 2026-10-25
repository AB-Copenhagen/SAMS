import { getCurrentUser, requirePermission } from '../../../lib/auth';
import { listStaffUsers } from '../../../lib/descope';
import AppShell from '../../../components/AppShell';
import UserRoleSelect from '../../../components/UserRoleSelect';

export default async function AdminUsersPage() {
  const user = requirePermission(await getCurrentUser(), 'adminSettings', 'edit');
  const users = await listStaffUsers();

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>Staff login accounts and their role.</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {users.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: '#8890b4' }}>
            No users found.
          </div>
        ) : (
          <div className="asset-table-wrap">
            <table className="asset-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.userId}>
                    <td style={{ fontWeight: 500 }}>{u.name || '—'}</td>
                    <td>{u.email}</td>
                    <td>
                      <UserRoleSelect userId={u.userId} loginId={u.loginId} role={u.role} />
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
