import { redirect } from 'next/navigation';
import { getCurrentUser } from '../lib/auth';
import { getCachedStaffPreferences, resolveLandingPage } from '../lib/staff-preferences';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const pref = await getCachedStaffPreferences(user.id);
  redirect(resolveLandingPage(pref, user.role, '/home'));
}
