import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Image fields accept an absolute http(s) URL or a file uploaded through POST /showcase/uploads. */
const MEDIA_URL = /^(https?:\/\/\S+|\/uploads\/[A-Za-z0-9._-]+)$/;
const MEDIA_MESSAGE = 'doit être une URL http(s) ou un fichier téléversé (/uploads/...)';
const WEB_URL = /^https?:\/\/\S+$/;
const WEB_MESSAGE = 'doit être une URL commençant par http:// ou https://';

export class UpdateShowcaseSettingsDto {
  @IsOptional() @IsString() @MaxLength(160) tagline?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(300) address?: string | null;
  @IsOptional() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(40) whatsappNumber?: string | null;
  @IsOptional() @IsInt() @Min(1800) @Max(2100) foundedYear?: number | null;

  @IsOptional() @Matches(MEDIA_URL, { message: `logoUrl ${MEDIA_MESSAGE}` }) logoUrl?: string | null;
  @IsOptional() @Matches(MEDIA_URL, { message: `coverImageUrl ${MEDIA_MESSAGE}` }) coverImageUrl?: string | null;

  @IsOptional() @Matches(WEB_URL, { message: `website ${WEB_MESSAGE}` }) website?: string | null;
  @IsOptional() @Matches(WEB_URL, { message: `mapUrl ${WEB_MESSAGE}` }) mapUrl?: string | null;
  @IsOptional() @Matches(WEB_URL, { message: `facebookUrl ${WEB_MESSAGE}` }) facebookUrl?: string | null;
  @IsOptional() @Matches(WEB_URL, { message: `instagramUrl ${WEB_MESSAGE}` }) instagramUrl?: string | null;
  @IsOptional() @Matches(WEB_URL, { message: `linkedinUrl ${WEB_MESSAGE}` }) linkedinUrl?: string | null;
  @IsOptional() @Matches(WEB_URL, { message: `youtubeUrl ${WEB_MESSAGE}` }) youtubeUrl?: string | null;
}

export class HighlightDto {
  @IsString() @MinLength(1) @MaxLength(20) value!: string;
  @IsString() @MinLength(1) @MaxLength(80) label!: string;
  @IsOptional() @IsInt() order?: number;
}

export class PhotoDto {
  @Matches(MEDIA_URL, { message: `url ${MEDIA_MESSAGE}` }) url!: string;
  @IsOptional() @IsString() @MaxLength(160) caption?: string | null;
  @IsOptional() @IsInt() order?: number;
}

export class PartnerDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @Matches(MEDIA_URL, { message: `logoUrl ${MEDIA_MESSAGE}` }) logoUrl?: string | null;
  @IsOptional() @Matches(WEB_URL, { message: `website ${WEB_MESSAGE}` }) website?: string | null;
  @IsOptional() @IsInt() order?: number;
}

export class TestimonialDto {
  @IsString() @MinLength(1) @MaxLength(120) authorName!: string;
  @IsOptional() @IsString() @MaxLength(120) authorRole?: string | null;
  @IsString() @MinLength(1) @MaxLength(1000) content!: string;
  @IsOptional() @Matches(MEDIA_URL, { message: `photoUrl ${MEDIA_MESSAGE}` }) photoUrl?: string | null;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsInt() order?: number;
}
