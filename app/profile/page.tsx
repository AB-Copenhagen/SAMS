import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import { getCachedStaffPreferences, LANDING_PAGE_CHOICES, PAGE_SIZE_OPTIONS } from '../../lib/staff-preferences';
import AppShell from '../../components/AppShell';
import ProfileClient from '../../components/ProfileClient';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const preferences = await getCachedStaffPreferences(user.id);
  const landingPageChoices = LANDING_PAGE_CHOICES.filter((c) => !c.adminOnly || user.role === 'ADMIN');

  return (
    <AppShell user={user}>
      <div className="page-header">
        <h1>My Profile</h1>
        <p>Manage your account details and security settings</p>
      </div>
      <ProfileClient
        preferences={preferences}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        landingPageChoices={landingPageChoices}
      />
    </AppShell>
  );
}
