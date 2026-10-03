import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PublicAdmissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(['M', 'F'])
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  requestedLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  previousSchool?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardianName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  guardianPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guardianRelation?: string;
}
