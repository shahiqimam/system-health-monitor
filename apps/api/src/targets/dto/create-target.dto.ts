import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';
import { HttpMethod } from '../../common/enums';

export class CreateTargetDto {
  @ApiProperty({ example: 'Demo healthy service' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ example: 'https://example.com/health' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @Length(8, 2048)
  url!: string;

  @ApiPropertyOptional({ enum: HttpMethod, default: HttpMethod.GET })
  @IsOptional()
  @IsEnum(HttpMethod)
  method?: HttpMethod;

  @ApiPropertyOptional({ default: 200, minimum: 100, maximum: 599 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  expectedStatusMin?: number;

  @ApiPropertyOptional({ default: 399, minimum: 100, maximum: 599 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  expectedStatusMax?: number;

  @ApiPropertyOptional({ default: 60, minimum: 15, maximum: 86400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(86400)
  intervalSeconds?: number;

  @ApiPropertyOptional({ default: 5000, minimum: 500, maximum: 30000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(30000)
  timeoutMs?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  followRedirects?: boolean;

  @ApiPropertyOptional({ default: 3, minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  maxRedirects?: number;
}

export class UpdateTargetDto extends PartialType(CreateTargetDto) {}
