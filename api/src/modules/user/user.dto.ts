import { IsString, IsOptional, IsArray, IsInt, MinLength, IsEmail } from 'class-validator';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  nickname: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsInt()
  @IsOptional()
  status?: number;

  @IsArray()
  @IsInt({ each: true })
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

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsInt()
  @IsOptional()
  status?: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  roleIds?: number[];
}
