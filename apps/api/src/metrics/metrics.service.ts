import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckResultStatus, MetricsWindow, WINDOW_HOURS } from '../common/enums';
import { CheckResult } from '../entities';
import {
  LatencySeriesPoint,
  LatencySummary,
  SeriesPoint,
  TargetMetrics,
  UptimeSummary,
} from './metrics.types';
import { calculateUptimePercent } from './uptime';

/** Bucket width per window, chosen so a chart never exceeds ~30 points. */
const BUCKET_SECONDS: Record<MetricsWindow, number> = {
  '24h': 60 * 60,
  '7d': 6 * 60 * 60,
  '30d': 24 * 60 * 60,
};

const SUCCESS_FILTER = `COUNT(*) FILTER (WHERE c.status = '${CheckResultStatus.SUCCESS}')`;

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(CheckResult)
    private readonly checks: Repository<CheckResult>,
  ) {}

  windowStart(window: MetricsWindow, now: Date = new Date()): Date {
    return new Date(now.getTime() - WINDOW_HOURS[window] * 60 * 60 * 1000);
  }

  private bucketExpression(window: MetricsWindow): string {
    const bucket = BUCKET_SECONDS[window];
    return `to_timestamp(floor(extract(epoch from c.checked_at) / ${bucket}) * ${bucket})`;
  }

  async getUptime(
    targetId: string | null,
    window: MetricsWindow,
    now: Date = new Date(),
  ): Promise<UptimeSummary> {
    const from = this.windowStart(window, now);
    const qb = this.checks
      .createQueryBuilder('c')
      .select('COUNT(*)', 'total')
      .addSelect(SUCCESS_FILTER, 'successful')
      .where('c.checkedAt >= :from', { from })
      .andWhere('c.checkedAt <= :to', { to: now });
    if (targetId) qb.andWhere('c.targetId = :targetId', { targetId });

    const row = await qb.getRawOne<{ total: string; successful: string }>();
    const totalChecks = Number(row?.total ?? 0);
    const successfulChecks = Number(row?.successful ?? 0);

    return {
      window,
      from: from.toISOString(),
      to: now.toISOString(),
      totalChecks,
      successfulChecks,
      failedChecks: totalChecks - successfulChecks,
      uptimePercent: calculateUptimePercent(successfulChecks, totalChecks),
    };
  }

  /**
   * Percentiles come from PostgreSQL `percentile_disc`, i.e. the nearest-rank
   * definition: p95 is a latency value that was actually observed. Only
   * successful checks with a recorded latency are included.
   */
  async getLatency(
    targetId: string | null,
    window: MetricsWindow,
    now: Date = new Date(),
  ): Promise<LatencySummary> {
    const from = this.windowStart(window, now);
    const qb = this.checks
      .createQueryBuilder('c')
      .select('COUNT(*)', 'samples')
      .addSelect('AVG(c.latencyMs)', 'avg')
      .addSelect('MIN(c.latencyMs)', 'min')
      .addSelect('MAX(c.latencyMs)', 'max')
      .addSelect('PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY c.latency_ms)', 'p50')
      .addSelect('PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY c.latency_ms)', 'p95')
      .where('c.checkedAt >= :from', { from })
      .andWhere('c.checkedAt <= :to', { to: now })
      .andWhere('c.status = :status', { status: CheckResultStatus.SUCCESS })
      .andWhere('c.latencyMs IS NOT NULL');
    if (targetId) qb.andWhere('c.targetId = :targetId', { targetId });

    const row = await qb.getRawOne<Record<string, string>>();
    return {
      sampleCount: Number(row?.samples ?? 0),
      averageMs: num(row?.avg),
      p50Ms: num(row?.p50),
      p95Ms: num(row?.p95),
      minMs: num(row?.min),
      maxMs: num(row?.max),
    };
  }

  async getUptimeSeries(
    targetId: string | null,
    window: MetricsWindow,
    now: Date = new Date(),
  ): Promise<SeriesPoint[]> {
    const from = this.windowStart(window, now);
    const qb = this.checks
      .createQueryBuilder('c')
      .select(this.bucketExpression(window), 'bucket')
      .addSelect('COUNT(*)', 'total')
      .addSelect(SUCCESS_FILTER, 'successful')
      .where('c.checkedAt >= :from', { from })
      .andWhere('c.checkedAt <= :to', { to: now })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC');
    if (targetId) qb.andWhere('c.targetId = :targetId', { targetId });

    const rows = await qb.getRawMany<{ bucket: Date; total: string; successful: string }>();
    return rows.map((row) => {
      const total = Number(row.total);
      const successful = Number(row.successful);
      return {
        bucket: new Date(row.bucket).toISOString(),
        totalChecks: total,
        successfulChecks: successful,
        uptimePercent: calculateUptimePercent(successful, total),
      };
    });
  }

  async getLatencySeries(
    targetId: string | null,
    window: MetricsWindow,
    now: Date = new Date(),
  ): Promise<LatencySeriesPoint[]> {
    const from = this.windowStart(window, now);
    const qb = this.checks
      .createQueryBuilder('c')
      .select(this.bucketExpression(window), 'bucket')
      .addSelect('COUNT(*)', 'samples')
      .addSelect('AVG(c.latencyMs)', 'avg')
      .addSelect('PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY c.latency_ms)', 'p95')
      .where('c.checkedAt >= :from', { from })
      .andWhere('c.checkedAt <= :to', { to: now })
      .andWhere('c.status = :status', { status: CheckResultStatus.SUCCESS })
      .andWhere('c.latencyMs IS NOT NULL')
      .groupBy('bucket')
      .orderBy('bucket', 'ASC');
    if (targetId) qb.andWhere('c.targetId = :targetId', { targetId });

    const rows = await qb.getRawMany<Record<string, string>>();
    return rows.map((row) => ({
      bucket: new Date(row.bucket).toISOString(),
      sampleCount: Number(row.samples),
      averageMs: num(row.avg),
      p95Ms: num(row.p95),
    }));
  }

  async getTargetMetrics(
    targetId: string,
    window: MetricsWindow,
    now: Date = new Date(),
  ): Promise<TargetMetrics> {
    const [uptime, latency, uptimeSeries, latencySeries] = await Promise.all([
      this.getUptime(targetId, window, now),
      this.getLatency(targetId, window, now),
      this.getUptimeSeries(targetId, window, now),
      this.getLatencySeries(targetId, window, now),
    ]);
    return { targetId, uptime, latency, uptimeSeries, latencySeries };
  }

  /** Per-target rollup used by the target list (spec 30). */
  async getUptimeByTarget(
    targetIds: string[],
    window: MetricsWindow,
    now: Date = new Date(),
  ): Promise<Map<string, TargetRollup>> {
    const result = new Map<string, TargetRollup>();
    if (targetIds.length === 0) return result;

    const from = this.windowStart(window, now);
    const rows = await this.checks
      .createQueryBuilder('c')
      .select('c.target_id', 'targetId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(SUCCESS_FILTER, 'successful')
      .addSelect(
        'PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY c.latency_ms) FILTER (WHERE c.latency_ms IS NOT NULL)',
        'p95',
      )
      .where('c.targetId IN (:...targetIds)', { targetIds })
      .andWhere('c.checkedAt >= :from', { from })
      .andWhere('c.checkedAt <= :to', { to: now })
      .groupBy('c.target_id')
      .getRawMany<Record<string, string>>();

    for (const row of rows) {
      const total = Number(row.total);
      result.set(row.targetId, {
        totalChecks: total,
        uptimePercent: calculateUptimePercent(Number(row.successful), total),
        p95Ms: num(row.p95),
      });
    }
    return result;
  }
}

export interface TargetRollup {
  totalChecks: number;
  uptimePercent: number | null;
  p95Ms: number | null;
}
