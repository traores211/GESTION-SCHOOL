import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;

  /** Six-digit code of the authenticator app, when two-factor authentication is on. */
  @IsOptional()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'Code à 6 chiffres attendu' })
  totp?: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MaxLength(128)
  newPassword!: string;
}

export class TotpCodeDto {
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'Code à 6 chiffres attendu' })
  code!: string;
}

export class TotpDisableDto extends TotpCodeDto {
  @IsString()
  @MaxLength(200)
  password!: string;
}
