import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const STAFF_CATEGORIES = ['ENSEIGNANT', 'SURVEILLANT', 'EDUCATEUR', 'ADMINISTRATION', 'DIRECTION', 'COMPTABILITE', 'SECRETARIAT', 'TECHNIQUE', 'SECURITE', 'AUTRE'] as const;
export const CONTRACT_TYPES = ['CDI', 'CDD', 'VACATAIRE', 'STAGE', 'AUTRE'] as const;


/** The personnel file of a staff member; every field is optional so the file fills in over time. */
export class StaffProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  matricule?: string;

  @IsOptional()
  @IsIn([...STAFF_CATEGORIES])
  category?: string;

  @IsOptional()
  @IsIn(['M', 'F'])
  gender?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsIn([...CONTRACT_TYPES])
  contractType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  diploma?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  qualification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialty?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  experienceYears?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankAccount?: string;
}
