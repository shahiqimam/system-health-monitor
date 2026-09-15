import type { TargetStatus } from './types';

export const formatDateTime = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString() : '—';

export const formatRelative = (value: string | null | undefined): string => {
  if (!value) return 'never';
  const deltaSeconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  if (deltaSeconds < 3600) return `${Math.round(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.round(deltaSeconds / 3600)}h ago`;
  return `${Math.round(deltaSeconds / 86400)}d ago`;
};

/** null means "no samples in the window" and must never render as 0% or 100%. */
export const formatUptime = (percent: number | null | undefined): string =>
  percent === null || percent === undefined ? 'no data' : `${percent.toFixed(2)}%`;

export const formatMs = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${Math.round(value)} ms`;

/** Hostname only: avoids splashing query strings across list views (spec 30). */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export const statusClasses: Record<TargetStatus, string> = {
  UP: 'bg-green-100 text-green-800 border-green-300',
  DEGRADED: 'bg-amber-100 text-amber-800 border-amber-300',
  DOWN: 'bg-red-100 text-red-800 border-red-300',
  PAUSED: 'bg-slate-200 text-slate-700 border-slate-300',
  UNKNOWN: 'bg-slate-100 text-slate-600 border-slate-300',
};

export const bucketLabel = (iso: string, window: string): string => {
  const date = new Date(iso);
  if (window === '24h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
