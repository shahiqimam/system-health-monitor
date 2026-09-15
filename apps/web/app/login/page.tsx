'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/lib/auth';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      router.replace('/dashboard');
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Login failed');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Pulse<span className="text-slate-400">Watch</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">Service health &amp; uptime monitor</p>

        <form onSubmit={handleSubmit(onSubmit)} className="card mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" className="input" autoComplete="username" {...register('email')} />
            {errors.email ? (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password ? (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            ) : null}
          </div>

          {serverError ? (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {serverError}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary w-full justify-center" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          Demo accounts are created by the seed script: admin@pulsewatch.local,
          operator@pulsewatch.local, viewer@pulsewatch.local.
        </p>
      </div>
    </main>
  );
}
