import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

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
}
