import { IsString, IsOptional, IsInt, IsIn } from 'class-validator';

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
