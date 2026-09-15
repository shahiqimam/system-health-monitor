export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';
export type TargetStatus = 'UNKNOWN' | 'UP' | 'DEGRADED' | 'DOWN' | 'PAUSED';
export type CheckStatus = 'SUCCESS' | 'FAILURE';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type MetricsWindow = '24h' | '7d' | '30d';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Rollup {
  totalChecks: number;
  uptimePercent: number | null;
  p95Ms: number | null;
}

export interface MonitorTarget {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'HEAD';
  expectedStatusMin: number;
  expectedStatusMax: number;
  intervalSeconds: number;
  timeoutMs: number;
  followRedirects: boolean;
  maxRedirects: number;
  enabled: boolean;
  archived: boolean;
  status: TargetStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
  rollup24h?: Rollup | null;
}

export interface CheckResult {
  id: string;
  targetId: string;
  status: CheckStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  errorType: string | null;
  errorMessage: string | null;
  checkedAt: string;
}

export interface Incident {
  id: string;
  targetId: string;
  status: IncidentStatus;
  startedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  failureCountAtOpen: number;
  summary: string;
  target?: MonitorTarget;
  acknowledgedBy?: { id: string; name: string } | null;
}

export interface IncidentNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorId: string | null;
  authorName: string;
}

export interface IncidentDetail extends Incident {
  notes: IncidentNote[];
  timeline: CheckResult[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface UptimeSummary {
  window: MetricsWindow;
  from: string;
  to: string;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  uptimePercent: number | null;
}

export interface LatencySummary {
  sampleCount: number;
  averageMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  minMs: number | null;
  maxMs: number | null;
}

export interface SeriesPoint {
  bucket: string;
  totalChecks: number;
  successfulChecks: number;
  uptimePercent: number | null;
}

export interface LatencySeriesPoint {
  bucket: string;
  sampleCount: number;
  averageMs: number | null;
  p95Ms: number | null;
}

export interface TargetMetrics {
  targetId: string;
  uptime: UptimeSummary;
  latency: LatencySummary;
  uptimeSeries: SeriesPoint[];
  latencySeries: LatencySeriesPoint[];
}

export interface DashboardSummary {
  totalTargets: number;
  up: number;
  degraded: number;
  down: number;
  unknown: number;
  paused: number;
  openIncidents: number;
  averageUptime24h: number | null;
  uptimeSampleCount: number;
}
