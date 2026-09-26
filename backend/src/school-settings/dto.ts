import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SECTION_TYPES } from './branding';

const HEX = /^#[0-9a-fA-F]{6}$/;
export const FONTS = ['Inter', 'Source Sans 3', 'Nunito', 'Merriweather', 'Poppins'] as const;

export class SectionItemDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
  @IsOptional() @IsString() @MaxLength(40) date?: string;
}

export class ShowcaseSectionDto {
  @IsIn(SECTION_TYPES as unknown as string[]) type!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SectionItemDto)
  items?: SectionItemDto[];
}

export class SocialLinksDto {
  @IsOptional() @IsString() @MaxLength(300) facebook?: string;
  @IsOptional() @IsString() @MaxLength(300) instagram?: string;
  @IsOptional() @IsString() @MaxLength(300) linkedin?: string;
  @IsOptional() @IsString() @MaxLength(300) youtube?: string;
  @IsOptional() @IsString() @MaxLength(30) whatsapp?: string;
}

export class UpdateSchoolSettingsDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(150) directeur?: string;
  @IsOptional() @IsString() @MaxLength(200) tagline?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) website?: string;

  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) faviconUrl?: string;
  @IsOptional() @Matches(HEX, { message: 'Couleur attendue au format #RRGGBB' }) primaryColor?: string;
  @IsOptional() @Matches(HEX, { message: 'Couleur attendue au format #RRGGBB' }) secondaryColor?: string;
  @IsOptional() @IsIn(FONTS as unknown as string[]) fontFamily?: string;
  @IsOptional() @IsString() @MaxLength(300) footerText?: string;
  @IsOptional() @IsString() @MaxLength(500) signatureUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) stampUrl?: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => SocialLinksDto) socialLinks?: SocialLinksDto;

  @IsOptional() @IsBoolean() showcasePublished?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ShowcaseSectionDto)
  showcaseSections?: ShowcaseSectionDto[];

  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(170) seoDescription?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
}

export class ContactMessageDto {
  @IsString() @MaxLength(120) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsString() @MaxLength(3000) message!: string;
  /** Honeypot: hidden field that humans leave empty; bots fill it. */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
