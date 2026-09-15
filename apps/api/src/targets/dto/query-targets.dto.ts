import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TargetStatus } from '../../common/enums';

export class QueryTargetsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Case-insensitive match on name or URL' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @ApiPropertyOptional({ enum: TargetStatus })
  @IsOptional()
  @IsEnum(TargetStatus)
  status?: TargetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Include archived targets', default: false })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  includeArchived?: boolean;
}
