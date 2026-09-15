import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CheckRunnerService } from '../checks/check-runner.service';
import { BlockedTargetError } from '../checks/ssrf/blocked-target.error';
import { UrlValidatorService } from '../checks/ssrf/url-validator.service';
import { PaginatedResult, paginate } from '../common/dto/pagination.dto';
import { AuditAction, HttpMethod, TargetStatus } from '../common/enums';
import { AppConfig } from '../config/configuration';
import { CheckResult, MonitorTarget } from '../entities';
import { MetricsService, TargetRollup } from '../metrics/metrics.service';
import { CreateTargetDto, UpdateTargetDto } from './dto/create-target.dto';
import { QueryChecksDto } from './dto/query-checks.dto';
import { QueryTargetsDto } from './dto/query-targets.dto';

export type TargetWithRollup = MonitorTarget & { rollup24h: TargetRollup | null };

@Injectable()
export class TargetsService {
  constructor(
    @InjectRepository(MonitorTarget)
    private readonly targets: Repository<MonitorTarget>,
    @InjectRepository(CheckResult)
    private readonly checks: Repository<CheckResult>,
    private readonly urlValidator: UrlValidatorService,
    private readonly runner: CheckRunnerService,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  private async assertUrlAllowed(rawUrl: string): Promise<string> {
    try {
      const url = this.urlValidator.parseAndValidateSyntax(rawUrl);
      await this.urlValidator.assertDestinationAllowed(url);
      return url.toString();
    } catch (error) {
      if (error instanceof BlockedTargetError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private assertStatusRange(min: number, max: number): void {
    if (min > max) {
      throw new BadRequestException('expectedStatusMin must not exceed expectedStatusMax');
    }
  }

  async create(dto: CreateTargetDto, actorId: string): Promise<MonitorTarget> {
    const defaults = this.configService.get('checks', { infer: true });
    const url = await this.assertUrlAllowed(dto.url);
    const min = dto.expectedStatusMin ?? 200;
    const max = dto.expectedStatusMax ?? 399;
    this.assertStatusRange(min, max);

    const interval = dto.intervalSeconds ?? defaults.defaultIntervalSeconds;
    if (interval < defaults.minIntervalSeconds) {
      throw new BadRequestException(
        `intervalSeconds must be at least ${defaults.minIntervalSeconds}`,
      );
    }

    const target = this.targets.create({
      name: dto.name,
      url,
      method: dto.method ?? HttpMethod.GET,
      expectedStatusMin: min,
      expectedStatusMax: max,
      intervalSeconds: interval,
      timeoutMs: dto.timeoutMs ?? defaults.defaultTimeoutMs,
      followRedirects: dto.followRedirects ?? false,
      maxRedirects: dto.maxRedirects ?? defaults.maxRedirects,
      enabled: true,
      archived: false,
      status: TargetStatus.UNKNOWN,
    });

    const saved = await this.targets.save(target);
    await this.audit.record({
      actorId,
      action: AuditAction.TARGET_CREATED,
      entityType: 'MonitorTarget',
      entityId: saved.id,
      metadata: { name: saved.name },
    });
    return saved;
  }

  async findOne(id: string): Promise<MonitorTarget> {
    const target = await this.targets.findOne({ where: { id } });
    if (!target) throw new NotFoundException('Target not found');
    return target;
  }

  async findAll(query: QueryTargetsDto): Promise<PaginatedResult<TargetWithRollup>> {
    const qb = this.targets.createQueryBuilder('t');
    if (!query.includeArchived) qb.andWhere('t.archived = false');
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.enabled !== undefined) qb.andWhere('t.enabled = :enabled', { enabled: query.enabled });
    if (query.search) {
      qb.andWhere('(t.name ILIKE :search OR t.url ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [items, total] = await qb
      .orderBy('t.name', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const rollups = await this.metrics.getUptimeByTarget(
      items.map((item) => item.id),
      '24h',
    );

    return paginate(
      items.map((item) => ({ ...item, rollup24h: rollups.get(item.id) ?? null })),
      total,
      query.page,
      query.limit,
    );
  }

  async update(id: string, dto: UpdateTargetDto, actorId: string): Promise<MonitorTarget> {
    const target = await this.findOne(id);
    if (target.archived) throw new ConflictException('Archived targets cannot be edited');

    if (dto.url !== undefined) target.url = await this.assertUrlAllowed(dto.url);
    if (dto.name !== undefined) target.name = dto.name;
    if (dto.method !== undefined) target.method = dto.method;
    if (dto.expectedStatusMin !== undefined) target.expectedStatusMin = dto.expectedStatusMin;
    if (dto.expectedStatusMax !== undefined) target.expectedStatusMax = dto.expectedStatusMax;
    this.assertStatusRange(target.expectedStatusMin, target.expectedStatusMax);

    const defaults = this.configService.get('checks', { infer: true });
    if (dto.intervalSeconds !== undefined) {
      if (dto.intervalSeconds < defaults.minIntervalSeconds) {
        throw new BadRequestException(
          `intervalSeconds must be at least ${defaults.minIntervalSeconds}`,
        );
      }
      target.intervalSeconds = dto.intervalSeconds;
    }
    if (dto.timeoutMs !== undefined) target.timeoutMs = dto.timeoutMs;
    if (dto.followRedirects !== undefined) target.followRedirects = dto.followRedirects;
    if (dto.maxRedirects !== undefined) target.maxRedirects = dto.maxRedirects;

    const saved = await this.targets.save(target);
    await this.audit.record({
      actorId,
      action: AuditAction.TARGET_UPDATED,
      entityType: 'MonitorTarget',
      entityId: saved.id,
      metadata: { fields: Object.keys(dto) },
    });
    return saved;
  }

  /**
   * Pausing never touches incident state (spec 15): a DOWN target that is
   * paused keeps its open incident, which must be resolved by recovery after
   * resume or by an explicit admin action.
   */
  async pause(id: string, actorId: string): Promise<MonitorTarget> {
    const target = await this.findOne(id);
    if (!target.enabled) throw new ConflictException('Target is already paused');
    target.enabled = false;
    target.status = TargetStatus.PAUSED;
    const saved = await this.targets.save(target);
    await this.audit.record({
      actorId,
      action: AuditAction.TARGET_PAUSED,
      entityType: 'MonitorTarget',
      entityId: id,
    });
    return saved;
  }

  async resume(id: string, actorId: string): Promise<MonitorTarget> {
    const target = await this.findOne(id);
    if (target.archived) throw new ConflictException('Archived targets cannot be resumed');
    if (target.enabled) throw new ConflictException('Target is already running');
    target.enabled = true;
    // The previous health verdict is stale after a pause of unknown length.
    target.status = TargetStatus.UNKNOWN;
    target.consecutiveFailures = 0;
    target.consecutiveSuccesses = 0;
    const saved = await this.targets.save(target);
    await this.audit.record({
      actorId,
      action: AuditAction.TARGET_RESUMED,
      entityType: 'MonitorTarget',
      entityId: id,
    });
    return saved;
  }

  async archive(id: string, actorId: string): Promise<MonitorTarget> {
    const target = await this.findOne(id);
    target.archived = true;
    target.enabled = false;
    target.status = TargetStatus.PAUSED;
    const saved = await this.targets.save(target);
    await this.audit.record({
      actorId,
      action: AuditAction.TARGET_ARCHIVED,
      entityType: 'MonitorTarget',
      entityId: id,
    });
    return saved;
  }

  async checkNow(id: string, actorId: string) {
    const target = await this.findOne(id);
    if (target.archived) throw new ConflictException('Archived targets cannot be checked');
    if (!target.enabled) throw new ConflictException('Paused targets are not checked');

    await this.audit.record({
      actorId,
      action: AuditAction.MANUAL_CHECK_REQUESTED,
      entityType: 'MonitorTarget',
      entityId: id,
    });

    const outcome = await this.runner.runForTarget(id, actorId);
    if (!outcome.ran) {
      throw new ConflictException(
        outcome.reason === 'locked'
          ? 'A check for this target is already running'
          : 'Target is not checkable',
      );
    }
    return {
      target: await this.findOne(id),
      result: outcome.result,
      incidentOpened: outcome.incidentOpened ?? false,
      incidentResolved: outcome.incidentResolved ?? false,
    };
  }

  async listChecks(id: string, query: QueryChecksDto): Promise<PaginatedResult<CheckResult>> {
    await this.findOne(id);
    const where: Record<string, unknown> = { targetId: id };
    if (query.status) where.status = query.status;
    if (query.dateFrom && query.dateTo) {
      where.checkedAt = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      where.checkedAt = MoreThanOrEqual(query.dateFrom);
    } else if (query.dateTo) {
      where.checkedAt = LessThanOrEqual(query.dateTo);
    }

    const [items, total] = await this.checks.findAndCount({
      where,
      order: { checkedAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return paginate(items, total, query.page, query.limit);
  }
}
