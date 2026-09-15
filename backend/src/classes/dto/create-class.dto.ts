import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateClassDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  level!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;
}
