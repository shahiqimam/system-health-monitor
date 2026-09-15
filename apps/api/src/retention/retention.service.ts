import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { CheckResult } from '../entities';

/**
 * Check samples grow without bound (spec 36): ~1,440 rows/day/target at a
 * 60s interval. This job prunes samples older than CHECK_RETENTION_DAYS.
 *
 * Incidents are NEVER pruned - they are the durable record of what happened
 * and are far smaller than the raw samples.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @InjectRepository(CheckResult)
    private readonly checks: Repository<CheckResult>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  cutoffDate(now: Date = new Date()): Date {
    const { retentionDays } = this.configService.get('checks', { infer: true });
    return new Date(now.getTime() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000);
  }

  async pruneOldChecks(now: Date = new Date()): Promise<number> {
    const cutoff = this.cutoffDate(now);
    const result = await this.checks.delete({ checkedAt: LessThan(cutoff) });
    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log(`Retention: deleted ${deleted} check results older than ${cutoff.toISOString()}`);
    }
    return deleted;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'pulsewatch-retention' })
  async handleDailyCleanup(): Promise<void> {
    try {
      await this.pruneOldChecks();
    } catch (error) {
      this.logger.error(`Retention job failed: ${(error as Error).message}`);
    }
  }
}
