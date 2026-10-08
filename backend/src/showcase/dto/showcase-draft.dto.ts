import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { UpdateShowcaseSettingsDto } from './showcase.dto';

const MEDIA_URL = /^(https?:\/\/\S+|\/uploads\/[A-Za-z0-9._-]+)$/;
const MEDIA_MESSAGE = 'doit être une URL http(s) ou un fichier téléversé (/uploads/...)';

class EventDto {
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
}

class DownloadDto {
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @Matches(MEDIA_URL, { message: `url ${MEDIA_MESSAGE}` }) url!: string;
}

/** Everything that is edited as a draft, previewed, then published in one go. */
export class ShowcaseDraftDto extends UpdateShowcaseSettingsDto {
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primaryColor doit être une couleur du type #1a7f4b' }) primaryColor?: string | null;
  @IsOptional() @Matches(MEDIA_URL, { message: `faviconUrl ${MEDIA_MESSAGE}` }) faviconUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) history?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) values?: string | null;
  @IsOptional() @IsString() @MaxLength(120) directorName?: string | null;
  @IsOptional() @IsString() @MaxLength(3000) directorMessage?: string | null;
  @IsOptional() @IsString() @MaxLength(300) openingHours?: string | null;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(160, { each: true }) facilities?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(160, { each: true }) activities?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => EventDto) events?: EventDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => DownloadDto) downloads?: DownloadDto[];
}
