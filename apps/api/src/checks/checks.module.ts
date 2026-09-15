import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CheckResult, Incident, MonitorTarget } from '../entities';
import { CheckEngineService } from './check-engine.service';
import { CheckRunnerService } from './check-runner.service';
import { UrlValidatorService } from './ssrf/url-validator.service';
import { TargetLockService } from './target-lock.service';

@Module({
  imports: [TypeOrmModule.forFeature([MonitorTarget, CheckResult, Incident]), AuditModule],
  providers: [UrlValidatorService, CheckEngineService, CheckRunnerService, TargetLockService],
  exports: [UrlValidatorService, CheckEngineService, CheckRunnerService, TargetLockService],
})
export class ChecksModule {}
