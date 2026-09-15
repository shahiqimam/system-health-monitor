'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { EmptyRow, ErrorNote } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { AuthUser, UserRole } from '@/lib/types';

interface AdminUser extends AuthUser {
  createdAt: string;
}

const ROLES: UserRole[] = ['ADMIN', 'OPERATOR', 'VIEWER'];

export default function AdminUsersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'VIEWER' as UserRole });
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<AdminUser[]>('/users'),
    enabled: can('ADMIN'),
  });

  const createUser = useMutation({
    mutationFn: () => api.post<AdminUser>('/users', form),
    onSuccess: () => {
      setForm({ name: '', email: '', password: '', role: 'VIEWER' });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : 'Could not create user'),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      api.patch(`/users/${id}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Could not update'),
  });

  if (!can('ADMIN')) {
    return (
      <AppShell>
        <p className="text-sm text-slate-600">Only administrators can manage users.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-semibold">Users</h1>
      <ErrorNote error={error ? new Error(error) : users.error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td className="text-slate-500">{user.email}</td>
                  <td>
                    <select
                      className="input max-w-[9rem]"
                      value={user.role}
                      onChange={(event) =>
                        changeRole.mutate({ id: user.id, role: event.target.value as UserRole })
                      }
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-slate-500">{formatDateTime(user.createdAt)}</td>
                </tr>
              ))}
              {users.data && users.data.length === 0 ? (
                <EmptyRow colSpan={4} label="No users" />
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Add user</h2>
          <div className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div>
              <label className="label">Password (min 10 characters)</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </div>
            <div>
              <label className="label">Role</label>
              <select
                className="input"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary w-full justify-center"
              disabled={createUser.isPending}
              onClick={() => createUser.mutate()}
            >
              Create user
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
