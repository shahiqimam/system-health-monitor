/**
 * Sample-based uptime (spec 24).
 *
 *   uptimePercent = successfulChecks / totalCompletedChecks * 100
 *
 * Only checks that actually exist in the window are counted. Time before
 * monitoring started is never treated as uptime, and a window with no samples
 * returns null rather than 100 or 0.
 *
 * This is NOT duration-weighted availability: a 60s-interval target that is
 * down for 20s between two successful checks records no failed sample at all.
 * See docs/UPTIME_CALCULATION.md.
 */
export const calculateUptimePercent = (
  successfulChecks: number,
  totalChecks: number,
): number | null => {
  if (totalChecks <= 0) return null;
  const percent = (successfulChecks / totalChecks) * 100;
  return Math.round(percent * 100) / 100;
};

/**
 * Nearest-rank percentile over an in-memory sample (used by tests and by any
 * caller that already holds the latency array). The SQL path uses
 * percentile_disc, which implements the same definition.
 */
export const nearestRankPercentile = (values: number[], percentile: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.min(100, Math.max(0, percentile));
  const rank = Math.ceil((clamped / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
};

export const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
};
