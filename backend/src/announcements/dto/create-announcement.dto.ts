import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @Matches(/^(https?:\/\/\S+|\/uploads\/[A-Za-z0-9._-]+)$/, {
    message: 'imageUrl doit être une URL http(s) ou un fichier téléversé (/uploads/...)',
  })
  imageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
