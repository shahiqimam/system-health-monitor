import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction, CheckResultStatus, IncidentStatus, TargetStatus } from '../common/enums';
import { AppConfig } from '../config/configuration';
import { CheckResult, Incident, MonitorTarget } from '../entities';
import { CheckEngineService } from './check-engine.service';
import { CheckExecutionResult } from './check-engine.types';
import { computeHealthTransition } from './health-state';
import { TargetLockService } from './target-lock.service';

export interface RunOutcome {
  ran: boolean;
  reason?: 'locked' | 'paused';
  result?: CheckExecutionResult;
  status?: TargetStatus;
  incidentOpened?: boolean;
  incidentResolved?: boolean;
}

/**
 * Orchestrates one full check: engine execution, result persistence, target
 * state transition and incident lifecycle - all inside one transaction so the
 * three writes can never disagree (spec 38).
 */
@Injectable()
export class CheckRunnerService {
  private readonly logger = new Logger(CheckRunnerService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly engine: CheckEngineService,
    private readonly locks: TargetLockService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async runForTarget(targetId: string, actorId: string | null = null): Promise<RunOutcome> {
    if (!this.locks.tryAcquire(targetId)) {
      return { ran: false, reason: 'locked' };
    }

    try {
      const target = await this.dataSource.getRepository(MonitorTarget).findOne({
        where: { id: targetId },
      });
      if (!target || !target.enabled || target.archived) {
        return { ran: false, reason: 'paused' };
      }

      const result = await this.engine.checkTarget(target);
      return await this.persist(target, result, actorId);
    } finally {
      this.locks.release(targetId);
    }
  }

  private async persist(
    target: MonitorTarget,
    result: CheckExecutionResult,
    actorId: string | null,
  ): Promise<RunOutcome> {
    const thresholds = this.configService.get('checks', { infer: true });

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const activeIncident = await manager.getRepository(Incident).findOne({
        where: { targetId: target.id, status: Not(IncidentStatus.RESOLVED) },
      });

      const decision = computeHealthTransition(
        {
          status: target.status,
          consecutiveFailures: target.consecutiveFailures,
          consecutiveSuccesses: target.consecutiveSuccesses,
          hasActiveIncident: Boolean(activeIncident),
        },
        result.status,
        thresholds,
      );

      await manager.getRepository(CheckResult).insert({
        targetId: target.id,
        status: result.status,
        httpStatus: result.httpStatus,
        latencyMs: result.latencyMs,
        errorType: result.errorType,
        errorMessage: result.errorMessage,
        checkedAt: result.checkedAt,
      });

      await manager.getRepository(MonitorTarget).update(target.id, {
        status: decision.status,
        consecutiveFailures: decision.consecutiveFailures,
        consecutiveSuccesses: decision.consecutiveSuccesses,
        lastCheckedAt: result.checkedAt,
        ...(result.status === CheckResultStatus.SUCCESS
          ? { lastSuccessAt: result.checkedAt }
          : { lastFailureAt: result.checkedAt }),
      });

      let incidentOpened = false;
      let incidentResolved = false;

      if (decision.shouldOpenIncident) {
        const summary = this.buildSummary(target, result, decision.consecutiveFailures);
        const inserted = await manager.getRepository(Incident).insert({
          targetId: target.id,
          status: IncidentStatus.OPEN,
          startedAt: result.checkedAt,
          failureCountAtOpen: decision.consecutiveFailures,
          summary,
        });
        incidentOpened = true;
        await this.audit.record(
          {
            actorId,
            action: AuditAction.INCIDENT_OPENED,
            entityType: 'Incident',
            entityId: inserted.identifiers[0]?.id as string,
            metadata: { targetId: target.id, failureCount: decision.consecutiveFailures },
          },
          manager,
        );
      }

      if (decision.shouldResolveIncident && activeIncident) {
        await manager.getRepository(Incident).update(activeIncident.id, {
          status: IncidentStatus.RESOLVED,
          resolvedAt: result.checkedAt,
        });
        incidentResolved = true;
        await this.audit.record(
          {
            actorId,
            action: AuditAction.INCIDENT_RESOLVED,
            entityType: 'Incident',
            entityId: activeIncident.id,
            metadata: { targetId: target.id, autoResolved: true },
          },
          manager,
        );
      }

      this.logger.log(
        `Checked ${target.name}: ${result.status} -> ${decision.status}` +
          (incidentOpened ? ' (incident opened)' : '') +
          (incidentResolved ? ' (incident resolved)' : ''),
      );

      return {
        ran: true,
        result,
        status: decision.status,
        incidentOpened,
        incidentResolved,
      };
    });
  }

  private buildSummary(
    target: MonitorTarget,
    result: CheckExecutionResult,
    failures: number,
  ): string {
    const detail = result.errorType
      ? `${result.errorType}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}`
      : 'check failure';
    return `${target.name} failed ${failures} consecutive checks: ${detail}`.slice(0, 300);
  }
}
