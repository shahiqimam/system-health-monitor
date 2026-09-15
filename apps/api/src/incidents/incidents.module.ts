import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CheckResult, Incident, IncidentNote } from '../entities';
import { IncidentNotesController, IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [TypeOrmModule.forFeature([Incident, IncidentNote, CheckResult]), AuditModule],
  controllers: [IncidentsController, IncidentNotesController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
