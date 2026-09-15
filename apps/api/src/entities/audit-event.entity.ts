import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditAction } from '../common/enums';

@Entity('audit_events')
@Index('idx_audit_events_entity', ['entityType', 'entityId'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId!: string | null;

  @Column({ type: 'enum', enum: AuditAction })
  action!: AuditAction;

  @Column({ type: 'varchar', length: 60, name: 'entity_type' })
  entityType!: string;

  @Column({ type: 'uuid', name: 'entity_id', nullable: true })
  entityId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
