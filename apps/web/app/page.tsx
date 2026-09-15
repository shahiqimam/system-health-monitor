'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/dashboard' : '/login');
  }, [loading, user, router]);

  return <main className="p-8 text-sm text-slate-500">Loading PulseWatch…</main>;
}
