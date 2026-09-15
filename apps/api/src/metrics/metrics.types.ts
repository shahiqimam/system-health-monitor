import { MetricsWindow } from '../common/enums';

export interface UptimeSummary {
  window: MetricsWindow;
  from: string;
  to: string;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  /** null when the window contains no completed checks (spec 24). */
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

export interface TargetMetrics {
  targetId: string;
  uptime: UptimeSummary;
  latency: LatencySummary;
  uptimeSeries: SeriesPoint[];
  latencySeries: LatencySeriesPoint[];
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
