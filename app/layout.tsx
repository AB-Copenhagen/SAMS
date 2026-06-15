import './globals.css';
import type { Metadata } from 'next';
import DescopeProvider from '../components/DescopeProvider';

export const metadata: Metadata = {
  title: 'AB Media DAM',
  description: 'Minimal digital asset manager for photos and videos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DescopeProvider>{children}</DescopeProvider>
      </body>
    </html>
  );
}
