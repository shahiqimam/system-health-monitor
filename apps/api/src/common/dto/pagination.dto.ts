import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 200;

export class PaginationDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit = 25;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const paginate = <T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> => ({
  items,
  total,
  page,
  limit,
  pages: limit > 0 ? Math.ceil(total / limit) : 0,
});
