import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsQueryDto } from '../targets/dto/metrics-query.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Summary cards for the dashboard' })
  summary() {
    return this.dashboardService.getSummary();
  }

  @Get('status-distribution')
  @ApiOperation({ summary: 'Target count per health status' })
  statusDistribution() {
    return this.dashboardService.getStatusDistribution();
  }

  @Get('incidents')
  @ApiOperation({ summary: 'Active incidents and recent recoveries' })
  incidents() {
    return this.dashboardService.getIncidentPanels();
  }

  @Get('latency')
  @ApiOperation({ summary: 'Fleet latency summary and bucketed series' })
  latency(@Query() query: MetricsQueryDto) {
    return this.dashboardService.getLatency(query.window);
  }

  @Get('uptime')
  @ApiOperation({ summary: 'Fleet uptime series for the selected window' })
  uptime(@Query() query: MetricsQueryDto) {
    return this.dashboardService.getUptimeTrend(query.window);
  }
}
