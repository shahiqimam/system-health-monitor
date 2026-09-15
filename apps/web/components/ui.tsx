'use client';

import { statusClasses } from '@/lib/format';
import type { IncidentStatus, TargetStatus } from '@/lib/types';

export function StatusBadge({ status }: { status: TargetStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClasses[status]}`}
    >
      {status}
    </span>
  );
}

const incidentClasses: Record<IncidentStatus, string> = {
  OPEN: 'bg-red-100 text-red-800 border-red-300',
  ACKNOWLEDGED: 'bg-amber-100 text-amber-800 border-amber-300',
  RESOLVED: 'bg-green-100 text-green-800 border-green-300',
};

export function IncidentBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${incidentClasses[status]}`}
    >
      {status}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </div>
  );
}

export function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-sm text-slate-500">
        {label}
      </td>
    </tr>
  );
}

export function WindowPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: '24h' | '7d' | '30d') => void;
}) {
  return (
    <div className="flex gap-1">
      {(['24h', '7d', '30d'] as const).map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            value === option ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-300'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
