import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateNested } from 'class-validator';

const GRADE_TYPES = ['DEVOIR', 'INTERROGATION', 'COMPOSITION', 'EXAMEN', 'ORAL', 'TP', 'PROJET'] as const;

class GradeRecordDto {
  @IsString()
  studentId!: string;

  @IsNumber()
  @Min(0)
  score!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class EnterGradesDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  termId!: string;

  @IsIn(GRADE_TYPES)
  type!: (typeof GRADE_TYPES)[number];

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(100)
  maxScore?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GradeRecordDto)
  records!: GradeRecordDto[];
}
