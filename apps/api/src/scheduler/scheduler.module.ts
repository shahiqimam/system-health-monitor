import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecksModule } from '../checks/checks.module';
import { MonitorTarget } from '../entities';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [TypeOrmModule.forFeature([MonitorTarget]), ChecksModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
