'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { bucketLabel } from '@/lib/format';
import type { LatencySeriesPoint, SeriesPoint, TargetStatus } from '@/lib/types';

const STATUS_COLORS: Record<TargetStatus, string> = {
  UP: '#16a34a',
  DEGRADED: '#d97706',
  DOWN: '#dc2626',
  UNKNOWN: '#64748b',
  PAUSED: '#475569',
};

export function UptimeChart({ data, window }: { data: SeriesPoint[]; window: string }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No checks in this window yet.</p>;
  }
  const points = data.map((point) => ({
    label: bucketLabel(point.bucket, window),
    uptime: point.uptimePercent,
    checks: point.totalChecks,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
        <Tooltip
          formatter={(value: number | string, name) =>
            name === 'uptime' ? [`${value}%`, 'Uptime'] : [value, 'Checks']
          }
        />
        <Line type="monotone" dataKey="uptime" stroke="#0f172a" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LatencyChart({ data, window }: { data: LatencySeriesPoint[]; window: string }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No successful checks with latency in this window.
      </p>
    );
  }
  const points = data.map((point) => ({
    label: bucketLabel(point.bucket, window),
    average: point.averageMs,
    p95: point.p95Ms,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} unit="ms" />
        <Tooltip formatter={(value: number | string) => `${value} ms`} />
        <Line type="monotone" dataKey="average" stroke="#2563eb" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="p95" stroke="#d97706" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StatusDistributionChart({ data }: { data: Record<TargetStatus, number> }) {
  const points = (Object.keys(data) as TargetStatus[])
    .map((status) => ({ status, count: data[status] }))
    .filter((point) => point.count > 0);

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No targets configured yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="status" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {points.map((point) => (
            <Cell key={point.status} fill={STATUS_COLORS[point.status]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
