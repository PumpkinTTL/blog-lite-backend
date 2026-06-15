import { IsString, IsOptional, IsInt, IsIn, IsArray } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
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
  @IsInt({ each: true })
  ids: number[];
}

export class UpdateAnnouncementDto {
  @IsString()
  @IsOptional()
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
