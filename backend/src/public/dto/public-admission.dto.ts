import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PublicAdmissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
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

  /** Honeypot: hidden in the form, must stay empty (bots fill every field). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
