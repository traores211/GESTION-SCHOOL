import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

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

  /** Série / filière of the lycée ("A", "C", "D") */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  series?: string;

  /** Usual room of the class */
  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;
}
