import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsEnum(['interval', 'daily', 'weekly'])
  type: 'interval' | 'daily' | 'weekly';

  @IsInt()
  @Min(1)
  @Max(10080) // 最多一周
  @IsOptional()
  intervalMinutes?: number;

  @IsInt()
  @Min(0)
  @Max(23)
  @IsOptional()
  hour?: number;

  @IsInt()
  @Min(0)
  @Max(59)
  @IsOptional()
  minute?: number;

  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number;

  @IsInt()
  @Min(1)
  @Max(365)
  retainDays: number;
}

export class UpdateScheduleDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  name?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsEnum(['interval', 'daily', 'weekly'])
  @IsOptional()
  type?: 'interval' | 'daily' | 'weekly';

  @IsInt()
  @Min(1)
  @Max(10080)
  @IsOptional()
  intervalMinutes?: number;

  @IsInt()
  @Min(0)
  @Max(23)
  @IsOptional()
  hour?: number;

  @IsInt()
  @Min(0)
  @Max(59)
  @IsOptional()
  minute?: number;

  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number;

  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  retainDays?: number;
}
