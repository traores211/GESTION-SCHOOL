import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PLANS = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

export class CreateSchoolDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string;

  /** Becomes the sub-domain: lowercase letters, digits and dashes. */
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, {
    message: 'Code : 3 à 40 caractères, minuscules, chiffres et tirets',
  })
  code!: string;

  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsIn(PLANS) plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

  @IsString() @MinLength(1) @MaxLength(100) directorFirstName!: string;
  @IsString() @MinLength(1) @MaxLength(100) directorLastName!: string;
  @IsEmail() directorEmail!: string;
}

export class UpdateSchoolDto {
  @IsOptional() @IsIn(PLANS) plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional()
  @Matches(/^$|^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i, { message: 'Nom de domaine invalide' })
  customDomain?: string;

  @IsOptional() @IsObject() featureOverrides?: Record<string, boolean>;
}
