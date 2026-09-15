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
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/types';
import { MetricsService } from '../metrics/metrics.service';
import { CreateTargetDto, UpdateTargetDto } from './dto/create-target.dto';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { QueryChecksDto } from './dto/query-checks.dto';
import { QueryTargetsDto } from './dto/query-targets.dto';
import { TargetsService } from './targets.service';

@ApiTags('targets')
@ApiBearerAuth()
@Controller('targets')
export class TargetsController {
  constructor(
    private readonly targetsService: TargetsService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List monitor targets with 24h uptime rollups' })
  findAll(@Query() query: QueryTargetsDto) {
    return this.targetsService.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a monitor target (ADMIN)' })
  create(@Body() dto: CreateTargetDto, @CurrentUser() user: AuthUser) {
    return this.targetsService.create(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one target' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.targetsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a target (ADMIN)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTargetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.targetsService.update(id, dto, user.id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Pause checks for a target (OPERATOR)' })
  pause(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.targetsService.pause(id, user.id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Resume checks for a target (OPERATOR)' })
  resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.targetsService.resume(id, user.id);
  }

  @Post(':id/check-now')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Run one immediate check (OPERATOR, throttled)' })
  checkNow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.targetsService.checkNow(id, user.id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Archive a target (ADMIN)' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.targetsService.archive(id, user.id);
  }

  @Get(':id/checks')
  @ApiOperation({ summary: 'Paginated check history for a target' })
  listChecks(@Param('id', ParseUUIDPipe) id: string, @Query() query: QueryChecksDto) {
    return this.targetsService.listChecks(id, query);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Uptime and latency metrics for a window' })
  async metrics(@Param('id', ParseUUIDPipe) id: string, @Query() query: MetricsQueryDto) {
    await this.targetsService.findOne(id);
    return this.metricsService.getTargetMetrics(id, query.window);
  }
}
