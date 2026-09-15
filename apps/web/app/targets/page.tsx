'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { EmptyRow, ErrorNote, StatusBadge } from '@/components/ui';
import { api, queryString } from '@/lib/api';
import { formatMs, formatRelative, formatUptime, hostOf } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import type { MonitorTarget, Paginated, TargetStatus } from '@/lib/types';

const STATUSES: (TargetStatus | '')[] = ['', 'UP', 'DEGRADED', 'DOWN', 'UNKNOWN', 'PAUSED'];

export default function TargetsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TargetStatus | ''>('');
  const [page, setPage] = useState(1);

  const targets = useQuery({
    queryKey: ['targets', search, status, page],
    queryFn: () =>
      api.get<Paginated<MonitorTarget>>(
        `/targets${queryString({ search, status: status || undefined, page, limit: 25 })}`,
      ),
    refetchInterval: 20_000,
  });

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Targets</h1>
        <input
          className="input max-w-xs"
          placeholder="Search name or URL"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="input max-w-[10rem]"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as TargetStatus | '');
            setPage(1);
          }}
        >
          {STATUSES.map((option) => (
            <option key={option || 'all'} value={option}>
              {option || 'All statuses'}
            </option>
          ))}
        </select>
        {can('ADMIN') ? (
          <Link href="/targets/new" className="btn btn-primary ml-auto">
            New target
          </Link>
        ) : null}
      </div>

      <ErrorNote error={targets.error} />

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Host</th>
              <th>Status</th>
              <th>Uptime 24h</th>
              <th>p95 24h</th>
              <th>Last checked</th>
              <th>Last success</th>
            </tr>
          </thead>
          <tbody>
            {(targets.data?.items ?? []).map((target) => (
              <tr key={target.id}>
                <td>
                  <Link className="font-medium hover:underline" href={`/targets/${target.id}`}>
                    {target.name}
                  </Link>
                </td>
                <td className="text-slate-500">{hostOf(target.url)}</td>
                <td>
                  <StatusBadge status={target.status} />
                </td>
                <td>
                  {formatUptime(target.rollup24h?.uptimePercent ?? null)}
                  <span className="ml-1 text-xs text-slate-400">
                    ({target.rollup24h?.totalChecks ?? 0})
                  </span>
                </td>
                <td>{formatMs(target.rollup24h?.p95Ms ?? null)}</td>
                <td className="text-slate-500">{formatRelative(target.lastCheckedAt)}</td>
                <td className="text-slate-500">{formatRelative(target.lastSuccessAt)}</td>
              </tr>
            ))}
            {targets.data && targets.data.items.length === 0 ? (
              <EmptyRow colSpan={7} label="No targets match this filter" />
            ) : null}
          </tbody>
        </table>
      </div>

      {targets.data && targets.data.pages > 1 ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="text-slate-500">
            Page {targets.data.page} of {targets.data.pages} · {targets.data.total} targets
          </span>
          <button
            className="btn"
            disabled={page >= targets.data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}
