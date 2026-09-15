import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckResult } from '../entities';
import { MetricsService } from './metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([CheckResult])],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
