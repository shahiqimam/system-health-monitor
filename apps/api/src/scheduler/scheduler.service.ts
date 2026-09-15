import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckRunnerService } from '../checks/check-runner.service';
import { TargetStatus } from '../common/enums';
import { AppConfig } from '../config/configuration';
import { MonitorTarget } from '../entities';

export const SCHEDULER_INTERVAL_NAME = 'pulsewatch-check-tick';

/**
 * Single scheduler coordinator (spec 13).
 *
 * One interval ticks every SCHEDULER_TICK_SECONDS, selects targets whose
 * `lastCheckedAt + intervalSeconds` has elapsed, and runs them with a bounded
 * concurrency. There is deliberately NO cron decorator per database row.
 *
 * LIMITATION: this coordinator is in-process. Running several API replicas
 * would duplicate checks unless a distributed lock, leader election or a
 * dedicated worker queue is introduced.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private ticking = false;
  private initialized = false;
  private lastTickAt: Date | null = null;

  constructor(
    @InjectRepository(MonitorTarget)
    private readonly targets: Repository<MonitorTarget>,
    private readonly runner: CheckRunnerService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const { enabled, tickSeconds } = this.configService.get('scheduler', { infer: true });
    if (!enabled) {
      this.logger.warn('Scheduler disabled by configuration (SCHEDULER_ENABLED=false)');
      return;
    }
    const interval = setInterval(() => {
      void this.tick();
    }, Math.max(1, tickSeconds) * 1000);
    this.registry.addInterval(SCHEDULER_INTERVAL_NAME, interval);
    this.initialized = true;
    this.logger.log(`Scheduler started with a ${tickSeconds}s tick`);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getLastTickAt(): Date | null {
    return this.lastTickAt;
  }

  async findDueTargets(now: Date = new Date()): Promise<MonitorTarget[]> {
    return this.targets
      .createQueryBuilder('t')
      .where('t.enabled = :enabled', { enabled: true })
      .andWhere('t.archived = :archived', { archived: false })
      .andWhere('t.status != :paused', { paused: TargetStatus.PAUSED })
      .andWhere(
        // The bound parameter is cast explicitly: without the cast PostgreSQL
        // infers the placeholder type from the interval arithmetic and fails with
        // "operator does not exist: timestamp with time zone <= interval".
        '(t.lastCheckedAt IS NULL OR ' +
          "t.lastCheckedAt + (t.intervalSeconds * INTERVAL '1 second') <= CAST(:now AS timestamptz))",
        { now },
      )
      .orderBy('t.lastCheckedAt', 'ASC', 'NULLS FIRST')
      .limit(500)
      .getMany();
  }

  /** Exposed for tests and for the readiness probe. */
  async tick(): Promise<number> {
    if (this.ticking) {
      this.logger.debug('Previous tick still running; skipping this one');
      return 0;
    }
    this.ticking = true;
    this.lastTickAt = new Date();

    try {
      const due = await this.findDueTargets();
      if (due.length === 0) return 0;

      const { maxConcurrentChecks } = this.configService.get('scheduler', { infer: true });
      const limit = Math.max(1, maxConcurrentChecks);
      let executed = 0;

      for (let i = 0; i < due.length; i += limit) {
        const batch = due.slice(i, i + limit);
        const outcomes = await Promise.allSettled(
          batch.map((target) => this.runner.runForTarget(target.id, null)),
        );
        for (const outcome of outcomes) {
          if (outcome.status === 'fulfilled' && outcome.value.ran) executed += 1;
          if (outcome.status === 'rejected') {
            this.logger.error(`Check failed unexpectedly: ${String(outcome.reason)}`);
          }
        }
      }

      this.logger.debug(`Tick completed: ${executed}/${due.length} due targets checked`);
      return executed;
    } catch (error) {
      this.logger.error(`Scheduler tick failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.ticking = false;
    }
  }
}
