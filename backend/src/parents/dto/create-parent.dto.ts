import { IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** What a guardian is for one child (father of one pupil, tutor of another). */
export class GuardianLinkDto {
  @IsOptional()
  @IsIn(['PERE', 'MERE', 'TUTEUR', 'AUTRE'])
  relation?: string;

  @IsOptional()
  @IsBoolean()
  isLegalGuardian?: boolean;

  @IsOptional()
  @IsBoolean()
  isEmergencyContact?: boolean;

  /** May collect the child at the gate */
  @IsOptional()
  @IsBoolean()
  canPickUp?: boolean;
}

export class CreateParentDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsString()
  relationship!: string;

  @IsOptional()
  @IsString()
  profession?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsIn(['M', 'F'])
  gender?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

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
  @MaxLength(30)
  phone2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  employer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsIn(['CNI', 'PASSEPORT', 'CARTE_CONSULAIRE', 'PERMIS', 'AUTRE'])
  idType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  idNumber?: string;

  /** The guardian refuses SMS / WhatsApp messages from the school. */
  @IsOptional()
  @IsBoolean()
  smsOptOut?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[];
}
