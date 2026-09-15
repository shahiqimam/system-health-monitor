import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckResult } from '../entities';
import { RetentionService } from './retention.service';

@Module({
  imports: [TypeOrmModule.forFeature([CheckResult])],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
