import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { IncidentStatus } from '../../common/enums';

export class QueryIncidentsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;
}
