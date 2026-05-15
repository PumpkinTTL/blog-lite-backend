import { IsString, IsOptional, IsInt, IsIn } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsIn([0, 1])
  @IsOptional()
  status?: number;

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

  @IsIn([0, 1])
  @IsOptional()
  status?: number;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}
