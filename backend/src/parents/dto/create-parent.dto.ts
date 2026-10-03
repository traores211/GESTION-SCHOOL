import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

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

  /** The guardian refuses SMS / WhatsApp messages from the school. */
  @IsOptional()
  @IsBoolean()
  smsOptOut?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[];
}
