import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { ChecksModule } from '../checks/checks.module';
import { CheckResult, MonitorTarget } from '../entities';
import { MetricsModule } from '../metrics/metrics.module';
import { TargetsController } from './targets.controller';
import { TargetsService } from './targets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonitorTarget, CheckResult]),
    ChecksModule,
    MetricsModule,
    AuditModule,
  ],
  controllers: [TargetsController],
  providers: [TargetsService],
  exports: [TargetsService],
})
export class TargetsModule {}
