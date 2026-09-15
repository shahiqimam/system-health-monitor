'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { LatencyChart, UptimeChart } from '@/components/Charts';
import {
  EmptyRow,
  ErrorNote,
  IncidentBadge,
  StatCard,
  StatusBadge,
  WindowPicker,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMs, formatUptime } from '@/lib/format';
import type {
  CheckResult,
  Incident,
  MetricsWindow,
  MonitorTarget,
  Paginated,
  TargetMetrics,
} from '@/lib/types';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-44 shrink-0 text-slate-500">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}

export default function TargetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [window, setWindow] = useState<MetricsWindow>('24h');
  const [actionError, setActionError] = useState<string | null>(null);

  const target = useQuery({
    queryKey: ['target', id],
    queryFn: () => api.get<MonitorTarget>(`/targets/${id}`),
    refetchInterval: 15_000,
  });

  const metrics = useQuery({
    queryKey: ['target', id, 'metrics', window],
    queryFn: () => api.get<TargetMetrics>(`/targets/${id}/metrics?window=${window}`),
    refetchInterval: 20_000,
  });

  const checks = useQuery({
    queryKey: ['target', id, 'checks'],
    queryFn: () => api.get<Paginated<CheckResult>>(`/targets/${id}/checks?limit=20`),
    refetchInterval: 15_000,
  });

  const incidents = useQuery({
    queryKey: ['target', id, 'incidents'],
    queryFn: () => api.get<Paginated<Incident>>(`/incidents?targetId=${id}&limit=10`),
  });

  const action = useMutation({
    mutationFn: (path: string) => api.post(`/targets/${id}/${path}`),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['target', id] });
      queryClient.invalidateQueries({ queryKey: ['targets'] });
    },
    onError: (error: unknown) =>
      setActionError(error instanceof Error ? error.message : 'Action failed'),
  });

  if (target.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading target…</p>
      </AppShell>
    );
  }

  if (target.error || !target.data) {
    return (
      <AppShell>
        <ErrorNote error={target.error ?? new Error('Target not found')} />
      </AppShell>
    );
  }

  const data = target.data;

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{data.name}</h1>
        <StatusBadge status={data.status} />
        <div className="ml-auto flex items-center gap-2">
          <WindowPicker value={window} onChange={setWindow} />
          {can('ADMIN', 'OPERATOR') ? (
            <>
              <button
                className="btn"
                disabled={action.isPending || !data.enabled}
                onClick={() => action.mutate('check-now')}
              >
                Check now
              </button>
              <button
                className="btn"
                disabled={action.isPending}
                onClick={() => action.mutate(data.enabled ? 'pause' : 'resume')}
              >
                {data.enabled ? 'Pause' : 'Resume'}
              </button>
            </>
          ) : null}
          {can('ADMIN') && !data.archived ? (
            <button
              className="btn"
              disabled={action.isPending}
              onClick={() => action.mutate('archive')}
            >
              Archive
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? <ErrorNote error={new Error(actionError)} /> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard
          label={`Uptime ${window}`}
          value={formatUptime(metrics.data?.uptime.uptimePercent)}
          hint={`${metrics.data?.uptime.successfulChecks ?? 0} of ${
            metrics.data?.uptime.totalChecks ?? 0
          } checks`}
        />
        <StatCard label="Latency avg" value={formatMs(metrics.data?.latency.averageMs)} />
        <StatCard label="Latency p50" value={formatMs(metrics.data?.latency.p50Ms)} />
        <StatCard
          label="Latency p95"
          value={formatMs(metrics.data?.latency.p95Ms)}
          hint={`${metrics.data?.latency.sampleCount ?? 0} samples`}
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-2 text-sm font-semibold">Configuration</h2>
          <dl className="space-y-1 text-sm">
            <Row label="URL" value={data.url} />
            <Row label="Method" value={data.method} />
            <Row label="Interval" value={`${data.intervalSeconds}s`} />
            <Row label="Timeout" value={`${data.timeoutMs} ms`} />
            <Row
              label="Expected status"
              value={`${data.expectedStatusMin}-${data.expectedStatusMax}`}
            />
            <Row
              label="Redirects"
              value={data.followRedirects ? `follow up to ${data.maxRedirects}` : 'not followed'}
            />
            <Row label="Last checked" value={formatDateTime(data.lastCheckedAt)} />
            <Row label="Last success" value={formatDateTime(data.lastSuccessAt)} />
            <Row label="Last failure" value={formatDateTime(data.lastFailureAt)} />
            <Row label="Consecutive failures" value={String(data.consecutiveFailures)} />
            <Row label="Consecutive successes" value={String(data.consecutiveSuccesses)} />
          </dl>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Checks timeline ({window})</h2>
          <UptimeChart data={metrics.data?.uptimeSeries ?? []} window={window} />
        </div>
      </section>

      <section className="mt-4 card">
        <h2 className="mb-2 text-sm font-semibold">Latency ({window})</h2>
        <LatencyChart data={metrics.data?.latencySeries ?? []} window={window} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <h2 className="mb-2 text-sm font-semibold">Recent results</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Checked</th>
                <th>Result</th>
                <th>HTTP</th>
                <th>Latency</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {(checks.data?.items ?? []).map((check) => (
                <tr key={check.id}>
                  <td className="whitespace-nowrap">{formatDateTime(check.checkedAt)}</td>
                  <td
                    className={
                      check.status === 'SUCCESS'
                        ? 'font-medium text-green-700'
                        : 'font-medium text-red-700'
                    }
                  >
                    {check.status}
                  </td>
                  <td>{check.httpStatus ?? '-'}</td>
                  <td>{formatMs(check.latencyMs)}</td>
                  <td className="text-slate-500">{check.errorType ?? '-'}</td>
                </tr>
              ))}
              {checks.data && checks.data.items.length === 0 ? (
                <EmptyRow colSpan={5} label="No checks recorded yet" />
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto">
          <h2 className="mb-2 text-sm font-semibold">Incidents</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {(incidents.data?.items ?? []).map((incident) => (
                <tr key={incident.id}>
                  <td className="whitespace-nowrap">{formatDateTime(incident.startedAt)}</td>
                  <td>
                    <IncidentBadge status={incident.status} />
                  </td>
                  <td>
                    <Link className="hover:underline" href={`/incidents/${incident.id}`}>
                      {incident.summary}
                    </Link>
                  </td>
                </tr>
              ))}
              {incidents.data && incidents.data.items.length === 0 ? (
                <EmptyRow colSpan={3} label="No incidents for this target" />
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
