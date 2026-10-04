import { IsDateString, IsEmail, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsIn(['M', 'F'])
  gender!: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  placeOfBirth?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  specialNeeds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email?: string;

  @IsOptional()
  @IsIn(['EXTERNE', 'DEMI_PENSIONNAIRE', 'INTERNE'])
  regime?: string;

  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  previousSchool?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  previousClass?: string;

  /** Average of the previous year, out of 20 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  previousAverage?: number;

  @IsOptional()
  @IsString()
  classId?: string;
}
