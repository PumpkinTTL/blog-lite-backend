import { IsString, IsOptional, IsArray, IsInt, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  nickname: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsInt()
  @IsOptional()
  status?: number;

  @IsArray()
  @IsOptional()
  roleIds?: number[];
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  nickname?: string;

  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsInt()
  @IsOptional()
  status?: number;

  @IsArray()
  @IsOptional()
  roleIds?: number[];
}
