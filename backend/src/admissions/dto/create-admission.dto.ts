import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdmissionDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(['M', 'F'])
  gender?: string;
}
