import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaginatedResult, paginate } from '../common/dto/pagination.dto';
import { AuditAction, IncidentStatus, UserRole } from '../common/enums';
import { AuthUser } from '../common/types';
import { CheckResult, Incident, IncidentNote } from '../entities';
import { CreateIncidentNoteDto, UpdateIncidentNoteDto } from './dto/incident-note.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';

/** Checks shown around an incident start, for context on the detail page. */
const TIMELINE_LIMIT = 40;

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidents: Repository<Incident>,
    @InjectRepository(IncidentNote)
    private readonly notes: Repository<IncidentNote>,
    @InjectRepository(CheckResult)
    private readonly checks: Repository<CheckResult>,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryIncidentsDto): Promise<PaginatedResult<Incident>> {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.targetId) where.targetId = query.targetId;
    if (query.dateFrom && query.dateTo) {
      where.startedAt = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      where.startedAt = MoreThanOrEqual(query.dateFrom);
    } else if (query.dateTo) {
      where.startedAt = LessThanOrEqual(query.dateTo);
    }

    const [items, total] = await this.incidents.findAndCount({
      where,
      relations: { target: true, acknowledgedBy: true },
      order: { startedAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Incident> {
    const incident = await this.incidents.findOne({
      where: { id },
      relations: { target: true, acknowledgedBy: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async findOneDetailed(id: string) {
    const incident = await this.findOne(id);
    const [notes, timeline] = await Promise.all([
      this.notes.find({
        where: { incidentId: id },
        relations: { author: true },
        order: { createdAt: 'ASC' },
      }),
      this.checks.find({
        where: { targetId: incident.targetId },
        order: { checkedAt: 'DESC' },
        take: TIMELINE_LIMIT,
      }),
    ]);

    return {
      ...incident,
      acknowledgedBy: incident.acknowledgedBy
        ? { id: incident.acknowledgedBy.id, name: incident.acknowledgedBy.name }
        : null,
      notes: notes.map((note) => ({
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        authorId: note.authorId,
        authorName: note.author?.name ?? 'Deleted user',
      })),
      timeline,
    };
  }

  async acknowledge(id: string, user: AuthUser): Promise<Incident> {
    const incident = await this.findOne(id);
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new ConflictException('Resolved incidents cannot be acknowledged');
    }
    if (incident.status === IncidentStatus.ACKNOWLEDGED) {
      throw new ConflictException('Incident is already acknowledged');
    }

    incident.status = IncidentStatus.ACKNOWLEDGED;
    incident.acknowledgedAt = new Date();
    incident.acknowledgedById = user.id;
    const saved = await this.incidents.save(incident);

    await this.audit.record({
      actorId: user.id,
      action: AuditAction.INCIDENT_ACKNOWLEDGED,
      entityType: 'Incident',
      entityId: id,
    });
    return saved;
  }

  async addNote(id: string, dto: CreateIncidentNoteDto, user: AuthUser): Promise<IncidentNote> {
    await this.findOne(id);
    const note = await this.notes.save(
      this.notes.create({ incidentId: id, authorId: user.id, content: dto.content }),
    );
    await this.audit.record({
      actorId: user.id,
      action: AuditAction.INCIDENT_NOTE_ADDED,
      entityType: 'IncidentNote',
      entityId: note.id,
      metadata: { incidentId: id },
    });
    return note;
  }

  async updateNote(
    noteId: string,
    dto: UpdateIncidentNoteDto,
    user: AuthUser,
  ): Promise<IncidentNote> {
    const note = await this.notes.findOne({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Note not found');
    // Operators may only edit their own notes; admins may edit any note.
    if (note.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only edit your own notes');
    }
    note.content = dto.content;
    const saved = await this.notes.save(note);
    await this.audit.record({
      actorId: user.id,
      action: AuditAction.INCIDENT_NOTE_UPDATED,
      entityType: 'IncidentNote',
      entityId: noteId,
    });
    return saved;
  }
}
