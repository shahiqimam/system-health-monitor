import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HttpMethod, TargetStatus } from '../common/enums';

@Entity('monitor_targets')
@Index('idx_targets_status', ['status'])
@Index('idx_targets_enabled', ['enabled'])
export class MonitorTarget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @Column({ type: 'enum', enum: HttpMethod, default: HttpMethod.GET })
  method!: HttpMethod;

  @Column({ type: 'int', name: 'expected_status_min', default: 200 })
  expectedStatusMin!: number;

  @Column({ type: 'int', name: 'expected_status_max', default: 399 })
  expectedStatusMax!: number;

  @Column({ type: 'int', name: 'interval_seconds', default: 60 })
  intervalSeconds!: number;

  @Column({ type: 'int', name: 'timeout_ms', default: 5000 })
  timeoutMs!: number;

  @Column({ type: 'boolean', name: 'follow_redirects', default: false })
  followRedirects!: boolean;

  @Column({ type: 'int', name: 'max_redirects', default: 3 })
  maxRedirects!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  @Column({ type: 'enum', enum: TargetStatus, default: TargetStatus.UNKNOWN })
  status!: TargetStatus;

  @Column({ type: 'int', name: 'consecutive_failures', default: 0 })
  consecutiveFailures!: number;

  @Column({ type: 'int', name: 'consecutive_successes', default: 0 })
  consecutiveSuccesses!: number;

  @Column({ type: 'timestamptz', name: 'last_checked_at', nullable: true })
  lastCheckedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'last_success_at', nullable: true })
  lastSuccessAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'last_failure_at', nullable: true })
  lastFailureAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
