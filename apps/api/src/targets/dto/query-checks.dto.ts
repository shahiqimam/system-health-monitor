import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CheckResultStatus } from '../../common/enums';

export class QueryChecksDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CheckResultStatus })
  @IsOptional()
  @IsEnum(CheckResultStatus)
  status?: CheckResultStatus;

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
