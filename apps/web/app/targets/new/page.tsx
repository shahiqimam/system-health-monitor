'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AppShell } from '@/components/AppShell';
import { ErrorNote } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { MonitorTarget } from '@/lib/types';

const schema = z
  .object({
    name: z.string().min(2).max(120),
    url: z
      .string()
      .url('Enter an absolute URL')
      .refine((value) => /^https?:\/\//i.test(value), 'Only http and https targets are allowed'),
    method: z.enum(['GET', 'HEAD']),
    intervalSeconds: z.coerce.number().int().min(15).max(86400),
    timeoutMs: z.coerce.number().int().min(500).max(30000),
    expectedStatusMin: z.coerce.number().int().min(100).max(599),
    expectedStatusMax: z.coerce.number().int().min(100).max(599),
    followRedirects: z.boolean(),
    maxRedirects: z.coerce.number().int().min(0).max(5),
  })
  .refine((values) => values.expectedStatusMin <= values.expectedStatusMax, {
    message: 'Minimum status must not exceed maximum',
    path: ['expectedStatusMin'],
  });

type FormValues = z.infer<typeof schema>;

export default function NewTargetPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: 'GET',
      intervalSeconds: 60,
      timeoutMs: 5000,
      expectedStatusMin: 200,
      expectedStatusMax: 399,
      followRedirects: false,
      maxRedirects: 3,
    },
  });

  const create = useMutation({
    mutationFn: (values: FormValues) => api.post<MonitorTarget>('/targets', values),
    onSuccess: (target) => router.push(`/targets/${target.id}`),
    onError: (error: unknown) =>
      setServerError(error instanceof Error ? error.message : 'Could not create target'),
  });

  if (!can('ADMIN')) {
    return (
      <AppShell>
        <p className="text-sm text-slate-600">Only administrators can create targets.</p>
      </AppShell>
    );
  }

  const field = (label: string, name: keyof FormValues, type = 'text') => (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} type={type} className="input" {...register(name)} />
      {errors[name] ? (
        <p className="mt-1 text-xs text-red-600">{String(errors[name]?.message)}</p>
      ) : null}
    </div>
  );

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-semibold">New target</h1>

      <form
        className="card max-w-2xl space-y-4"
        onSubmit={handleSubmit((values) => {
          setServerError(null);
          create.mutate(values);
        })}
      >
        {field('Name', 'name')}
        {field('URL', 'url')}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="method">
              Method
            </label>
            <select id="method" className="input" {...register('method')}>
              <option value="GET">GET</option>
              <option value="HEAD">HEAD</option>
            </select>
          </div>
          {field('Interval (seconds, min 15)', 'intervalSeconds', 'number')}
          {field('Timeout (ms)', 'timeoutMs', 'number')}
          {field('Max redirects', 'maxRedirects', 'number')}
          {field('Expected status min', 'expectedStatusMin', 'number')}
          {field('Expected status max', 'expectedStatusMax', 'number')}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('followRedirects')} />
          Follow redirects (each hop is re-validated against SSRF policy)
        </label>

        <ErrorNote error={serverError ? new Error(serverError) : null} />

        <p className="text-xs text-slate-500">
          Targets resolving to private, loopback or link-local addresses are rejected unless the
          server runs with ALLOW_PRIVATE_TARGETS=true for a trusted local lab.
        </p>

        <div className="flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create target'}
          </button>
          <button type="button" className="btn" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </AppShell>
  );
}
