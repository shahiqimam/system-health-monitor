import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CheckErrorType, CheckResultStatus } from '../common/enums';
import { MonitorTarget } from './monitor-target.entity';

@Entity('check_results')
@Index('idx_check_results_target_checked_at', ['targetId', 'checkedAt'])
@Index('idx_check_results_status_checked_at', ['status', 'checkedAt'])
export class CheckResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'target_id' })
  targetId!: string;

  @ManyToOne(() => MonitorTarget, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_id' })
  target?: MonitorTarget;

  @Column({ type: 'enum', enum: CheckResultStatus })
  status!: CheckResultStatus;

  @Column({ type: 'int', name: 'http_status', nullable: true })
  httpStatus!: number | null;

  @Column({ type: 'int', name: 'latency_ms', nullable: true })
  latencyMs!: number | null;

  @Column({ type: 'enum', enum: CheckErrorType, name: 'error_type', nullable: true })
  errorType!: CheckErrorType | null;

  @Column({ type: 'varchar', length: 300, name: 'error_message', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'timestamptz', name: 'checked_at' })
  checkedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
