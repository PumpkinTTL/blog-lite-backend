import { IsInt, IsString, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RuleItemDto {
  @IsString()
  routeKey: string;

  @IsString()
  label: string;

  @IsInt()
  @Min(1)
  limit: number;

  @IsInt()
  @Min(1000)
  ttl: number;
}

export class UpdateRateLimitConfigDto {
  @IsInt()
  @Min(1)
  defaultLimit: number;

  @IsInt()
  @Min(1000)
  defaultTtl: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleItemDto)
  rules: RuleItemDto[];
}
