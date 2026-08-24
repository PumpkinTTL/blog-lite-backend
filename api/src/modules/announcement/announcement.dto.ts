import {
  IsString,
  IsOptional,
  IsInt, Min,
  IsIn,
  IsArray, ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  content: string;

  @IsIn(['hidden', 'visible'])
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class BatchIdsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @Min(1, { each: true })
  @IsInt({ each: true })
  ids: number[];
}

export class UpdateAnnouncementDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsIn(['hidden', 'visible'])
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}
