import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Length, Matches, Max, Min, MinLength, MaxLength } from 'class-validator';
export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(10) @MaxLength(72) password: string;
}
export class RegisterDto extends LoginDto {
  @IsString() @Length(2,80) name: string;
}
export class AreaDto {
  @IsString() @Length(2,100) name: string;
  @IsString() @Length(2,160) location: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsNumber() @Min(0) @Max(100000000) hectares: number;
}
export class DeviceDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,80}$/) id: string;
  @IsString() @Length(2,100) name: string;
  @IsIn(['HMP155','FS24X']) type: 'HMP155' | 'FS24X';
  @IsOptional() @IsString() areaId?: string | null;
}
export class AssignDto {
  @IsOptional() @IsString() areaId?: string | null;
  @IsOptional() @IsString() @Length(2,100) name?: string;
}
export class RoleDto {
  @IsIn(['ADMIN','MANAGER','VIEWER']) role: 'ADMIN' | 'MANAGER' | 'VIEWER';
}
export class RecordingDto {
  @IsBoolean() enabled: boolean;
}
