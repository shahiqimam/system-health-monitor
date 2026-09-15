'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/targets', label: 'Targets' },
  { href: '/incidents', label: 'Incidents' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, can } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) return <main className="p-8 text-sm text-slate-500">Loading…</main>;
  if (!user) return null;

  const links = can('ADMIN') ? [...NAV, { href: '/admin/users', label: 'Users' }] : NAV;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            Pulse<span className="text-slate-400">Watch</span>
          </Link>
          <nav className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  pathname.startsWith(link.href)
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {user.name} · <span className="font-medium text-slate-700">{user.role}</span>
            </span>
            <button className="btn" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
