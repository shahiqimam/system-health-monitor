import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { MetricsWindow } from '../../common/enums';

export class MetricsQueryDto {
  @ApiPropertyOptional({ enum: ['24h', '7d', '30d'], default: '24h' })
  @IsOptional()
  @IsIn(['24h', '7d', '30d'])
  window: MetricsWindow = '24h';
}
