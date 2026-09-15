import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IncidentStatus } from '../common/enums';
import { MonitorTarget } from './monitor-target.entity';
import { User } from './user.entity';

@Entity('incidents')
@Index('idx_incidents_target_status', ['targetId', 'status'])
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'target_id' })
  targetId!: string;

  @ManyToOne(() => MonitorTarget, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_id' })
  target?: MonitorTarget;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.OPEN })
  status!: IncidentStatus;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', name: 'acknowledged_at', nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ type: 'uuid', name: 'acknowledged_by_id', nullable: true })
  acknowledgedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'acknowledged_by_id' })
  acknowledgedBy?: User | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'int', name: 'failure_count_at_open' })
  failureCountAtOpen!: number;

  @Column({ type: 'varchar', length: 300 })
  summary!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
