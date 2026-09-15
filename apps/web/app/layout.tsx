import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'PulseWatch - Service Health & Uptime Monitor',
  description:
    'Educational portfolio monitor: scheduled HTTP health checks, incidents and uptime history.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
