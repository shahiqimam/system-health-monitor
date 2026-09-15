import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { IncidentStatus, MetricsWindow, TargetStatus } from '../common/enums';
import { Incident, MonitorTarget } from '../entities';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(MonitorTarget)
    private readonly targets: Repository<MonitorTarget>,
    @InjectRepository(Incident)
    private readonly incidents: Repository<Incident>,
    private readonly metrics: MetricsService,
  ) {}

  async getStatusDistribution(): Promise<Record<TargetStatus, number>> {
    const rows = await this.targets
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('t.archived = false')
      .groupBy('t.status')
      .getRawMany<{ status: TargetStatus; count: string }>();

    const distribution = {
      [TargetStatus.UNKNOWN]: 0,
      [TargetStatus.UP]: 0,
      [TargetStatus.DEGRADED]: 0,
      [TargetStatus.DOWN]: 0,
      [TargetStatus.PAUSED]: 0,
    };
    for (const row of rows) distribution[row.status] = Number(row.count);
    return distribution;
  }

  async getSummary() {
    const [distribution, openIncidents, uptime24h, totalTargets] = await Promise.all([
      this.getStatusDistribution(),
      this.incidents.count({ where: { status: Not(IncidentStatus.RESOLVED) } }),
      this.metrics.getUptime(null, '24h'),
      this.targets.count({ where: { archived: false } }),
    ]);

    return {
      totalTargets,
      up: distribution[TargetStatus.UP],
      degraded: distribution[TargetStatus.DEGRADED],
      down: distribution[TargetStatus.DOWN],
      unknown: distribution[TargetStatus.UNKNOWN],
      paused: distribution[TargetStatus.PAUSED],
      openIncidents,
      // Fleet-wide, sample-based: every check in the window across all targets.
      averageUptime24h: uptime24h.uptimePercent,
      uptimeSampleCount: uptime24h.totalChecks,
    };
  }

  async getIncidentPanels() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [active, recentRecoveries] = await Promise.all([
      this.incidents.find({
        where: { status: In([IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED]) },
        relations: { target: true },
        order: { startedAt: 'DESC' },
        take: 25,
      }),
      this.incidents.find({
        where: { status: IncidentStatus.RESOLVED, resolvedAt: MoreThanOrEqual(since) },
        relations: { target: true },
        order: { resolvedAt: 'DESC' },
        take: 10,
      }),
    ]);
    return { active, recentRecoveries };
  }

  async getLatency(window: MetricsWindow) {
    const [summary, series] = await Promise.all([
      this.metrics.getLatency(null, window),
      this.metrics.getLatencySeries(null, window),
    ]);
    return { window, summary, series };
  }

  async getUptimeTrend(window: MetricsWindow) {
    return { window, series: await this.metrics.getUptimeSeries(null, window) };
  }
}
