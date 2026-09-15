'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { LatencyChart, StatusDistributionChart, UptimeChart } from '@/components/Charts';
import { EmptyRow, ErrorNote, IncidentBadge, StatCard, WindowPicker } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatMs, formatRelative, formatUptime } from '@/lib/format';
import type {
  DashboardSummary,
  Incident,
  LatencySeriesPoint,
  LatencySummary,
  MetricsWindow,
  SeriesPoint,
  TargetStatus,
} from '@/lib/types';

export default function DashboardPage() {
  const [window, setWindow] = useState<MetricsWindow>('24h');

  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
    refetchInterval: 15_000,
  });

  const distribution = useQuery({
    queryKey: ['dashboard', 'distribution'],
    queryFn: () => api.get<Record<TargetStatus, number>>('/dashboard/status-distribution'),
    refetchInterval: 15_000,
  });

  const incidents = useQuery({
    queryKey: ['dashboard', 'incidents'],
    queryFn: () =>
      api.get<{ active: Incident[]; recentRecoveries: Incident[] }>('/dashboard/incidents'),
    refetchInterval: 15_000,
  });

  const uptime = useQuery({
    queryKey: ['dashboard', 'uptime', window],
    queryFn: () =>
      api.get<{ window: MetricsWindow; series: SeriesPoint[] }>(`/dashboard/uptime?window=${window}`),
  });

  const latency = useQuery({
    queryKey: ['dashboard', 'latency', window],
    queryFn: () =>
      api.get<{ window: MetricsWindow; summary: LatencySummary; series: LatencySeriesPoint[] }>(
        `/dashboard/latency?window=${window}`,
      ),
  });

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <WindowPicker value={window} onChange={setWindow} />
      </div>

      <ErrorNote error={summary.error} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total targets" value={summary.data?.totalTargets ?? '—'} />
        <StatCard label="Up" value={summary.data?.up ?? '—'} />
        <StatCard label="Degraded" value={summary.data?.degraded ?? '—'} />
        <StatCard label="Down" value={summary.data?.down ?? '—'} />
        <StatCard label="Open incidents" value={summary.data?.openIncidents ?? '—'} />
        <StatCard
          label="Avg 24h uptime"
          value={formatUptime(summary.data?.averageUptime24h)}
          hint={`${summary.data?.uptimeSampleCount ?? 0} checks sampled`}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Uptime over time ({window})</h2>
          <UptimeChart data={uptime.data?.series ?? []} window={window} />
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Latency history ({window})</h2>
          <LatencyChart data={latency.data?.series ?? []} window={window} />
          <p className="mt-2 text-xs text-slate-500">
            avg {formatMs(latency.data?.summary.averageMs)} · p50{' '}
            {formatMs(latency.data?.summary.p50Ms)} · p95 {formatMs(latency.data?.summary.p95Ms)} ·{' '}
            {latency.data?.summary.sampleCount ?? 0} samples
          </p>
        </div>
      </section>

      <section className="mt-4 card">
        <h2 className="mb-2 text-sm font-semibold">Status distribution</h2>
        <StatusDistributionChart
          data={
            distribution.data ?? { UP: 0, DEGRADED: 0, DOWN: 0, UNKNOWN: 0, PAUSED: 0 }
          }
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Active incidents</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {(incidents.data?.active ?? []).map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <Link className="font-medium hover:underline" href={`/incidents/${incident.id}`}>
                      {incident.target?.name ?? 'Target'}
                    </Link>
                  </td>
                  <td>
                    <IncidentBadge status={incident.status} />
                  </td>
                  <td className="text-slate-500">{formatRelative(incident.startedAt)}</td>
                </tr>
              ))}
              {incidents.data && incidents.data.active.length === 0 ? (
                <EmptyRow colSpan={3} label="No active incidents" />
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Recent recoveries</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {(incidents.data?.recentRecoveries ?? []).map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <Link className="font-medium hover:underline" href={`/incidents/${incident.id}`}>
                      {incident.target?.name ?? 'Target'}
                    </Link>
                  </td>
                  <td className="text-slate-500">{formatDateTime(incident.resolvedAt)}</td>
                </tr>
              ))}
              {incidents.data && incidents.data.recentRecoveries.length === 0 ? (
                <EmptyRow colSpan={2} label="No recoveries in the last 7 days" />
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
