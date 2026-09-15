import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/types';
import { CreateIncidentNoteDto, UpdateIncidentNoteDto } from './dto/incident-note.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { IncidentsService } from './incidents.service';

@ApiTags('incidents')
@ApiBearerAuth()
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @ApiOperation({ summary: 'List incidents with filters and pagination' })
  findAll(@Query() query: QueryIncidentsDto) {
    return this.incidentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Incident detail with notes and surrounding checks' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.findOneDetailed(id);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Acknowledge an open incident (OPERATOR)' })
  acknowledge(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.incidentsService.acknowledge(id, user);
  }

  @Post(':id/notes')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Add a note to an incident (OPERATOR)' })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateIncidentNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.incidentsService.addNote(id, dto, user);
  }
}

@ApiTags('incidents')
@ApiBearerAuth()
@Controller('incident-notes')
export class IncidentNotesController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Edit your own incident note (ADMIN can edit any)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.incidentsService.updateNote(id, dto, user);
  }
}
