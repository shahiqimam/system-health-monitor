import { average, calculateUptimePercent, nearestRankPercentile } from './uptime';

describe('calculateUptimePercent', () => {
  it('computes sample-based uptime', () => {
    expect(calculateUptimePercent(397, 400)).toBe(99.25);
    expect(calculateUptimePercent(98, 100)).toBe(98);
  });

  it('returns null when the window has no samples', () => {
    expect(calculateUptimePercent(0, 0)).toBeNull();
  });

  it('returns 0 when every sample failed', () => {
    expect(calculateUptimePercent(0, 12)).toBe(0);
  });

  it('rounds to two decimals', () => {
    expect(calculateUptimePercent(2, 3)).toBe(66.67);
  });
});

describe('nearestRankPercentile', () => {
  const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it('returns an observed value for p50 and p95', () => {
    expect(nearestRankPercentile(samples, 50)).toBe(50);
    expect(nearestRankPercentile(samples, 95)).toBe(100);
  });

  it('handles a single sample', () => {
    expect(nearestRankPercentile([42], 95)).toBe(42);
  });

  it('returns null with no samples', () => {
    expect(nearestRankPercentile([], 95)).toBeNull();
  });
});

describe('average', () => {
  it('averages latencies', () => {
    expect(average([100, 200, 300])).toBe(200);
  });

  it('returns null with no samples', () => {
    expect(average([])).toBeNull();
  });
});
