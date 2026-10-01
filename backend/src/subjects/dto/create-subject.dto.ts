import { IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  coefficient?: number;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Couleur attendue au format #RRGGBB' })
  color?: string;
}
