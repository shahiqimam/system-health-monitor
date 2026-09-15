import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { SchedulerService } from '../scheduler/scheduler.service';

/**
 * The monitor's own health (spec 34).
 *
 * Deliberately independent of monitored-target health: a customer endpoint
 * being DOWN is data, not a reason to take PulseWatch out of rotation.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scheduler: SchedulerService,
  ) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness: the process is running' })
  liveness() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness: PostgreSQL reachable and scheduler initialized' })
  async readiness() {
    let database = false;
    try {
      await this.dataSource.query('SELECT 1');
      database = true;
    } catch {
      database = false;
    }
    const scheduler = this.scheduler.isInitialized();

    const body = {
      status: database && scheduler ? 'ready' : 'not_ready',
      checks: {
        database,
        scheduler,
        lastSchedulerTickAt: this.scheduler.getLastTickAt()?.toISOString() ?? null,
      },
    };

    if (!database || !scheduler) throw new ServiceUnavailableException(body);
    return body;
  }
}
