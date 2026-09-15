import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const STAFF_ROLES = ['DIRECTOR', 'SECRETARY', 'COMPTABLE', 'ENSEIGNANT'] as const;

export class CreateStaffDto {
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

  @IsIn(STAFF_ROLES)
  role!: (typeof STAFF_ROLES)[number];

  @IsString()
  @MinLength(1)
  position!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsDateString()
  hireDate!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
