import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditAction } from '../common/enums';
import { AuditEvent } from '../entities';

export interface AuditInput {
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Scheduler-generated events carry a null actor (spec 39). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly repository: Repository<AuditEvent>,
  ) {}

  async record(input: AuditInput, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditEvent) : this.repository;
    try {
      await repo.insert({
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? null) as never,
      });
    } catch (error) {
      // Auditing must never break the operation it describes.
      this.logger.warn(`Failed to record audit event ${input.action}: ${(error as Error).message}`);
    }
  }
}
