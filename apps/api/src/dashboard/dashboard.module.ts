import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident, MonitorTarget } from '../entities';
import { MetricsModule } from '../metrics/metrics.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([MonitorTarget, Incident]), MetricsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
