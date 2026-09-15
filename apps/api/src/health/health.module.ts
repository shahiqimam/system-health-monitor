import { Module } from '@nestjs/common';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { HealthController } from './health.controller';

@Module({
  imports: [SchedulerModule],
  controllers: [HealthController],
})
export class HealthModule {}
