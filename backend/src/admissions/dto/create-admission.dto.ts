import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { ADMISSION_STATUSES, PIECE_STATUSES } from '../workflow';

export class CreateAdmissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @ValidateIf((o) => o.email !== '')
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email?: string;

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
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardianName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  guardianPhone?: string;

  @IsOptional()
  @ValidateIf((o) => o.guardianEmail !== '')
  @IsEmail({}, { message: 'E-mail du responsable invalide' })
  guardianEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guardianRelation?: string;
}

export class UpdateAdmissionDto extends PartialType(CreateAdmissionDto) {}

export class TransitionDto {
  @IsIn(ADMISSION_STATUSES as unknown as string[], { message: 'Étape inconnue' })
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class NoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  /** NOTE = internal note, CONTACT = call / SMS / meeting with the family */
  @IsOptional()
  @IsIn(['NOTE', 'CONTACT'])
  kind?: 'NOTE' | 'CONTACT';
}

export class PieceUpdateDto {
  @IsIn(PIECE_STATUSES as unknown as string[])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AddPieceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class TestDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  score?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class InterviewDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsIn(['FAVORABLE', 'RESERVE', 'DEFAVORABLE'])
  opinion?: string;
}

export class AssignClassDto {
  @IsString()
  classId!: string;
}
