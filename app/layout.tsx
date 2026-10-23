import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import DescopeProvider from '../components/DescopeProvider';

export const metadata: Metadata = {
  title: 'AB Media DAM',
  description: 'Minimal digital asset manager for photos and videos',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read directly from the cookie (not the cached DB preference) so the theme applies on the
  // very first paint with no DB round trip and no flash of the wrong theme — see
  // app/api/profile/preferences/route.ts, which sets this cookie whenever the theme preference
  // is saved.
  const theme = (await cookies()).get('theme')?.value;
  const dataTheme = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : undefined;

  return (
    <html lang="en" data-theme={dataTheme}>
      <body>
        <DescopeProvider>{children}</DescopeProvider>
      </body>
    </html>
  );
}
