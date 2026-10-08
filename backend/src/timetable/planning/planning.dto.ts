import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { TIME_PATTERN } from '../domain/time';

const TIME_MESSAGE = 'Horaire attendu au format HH:MM (ex. 08:30)';

export class OptionsQueryDto {
  @IsString()
  classId!: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  endTime?: string;

  /** Lesson being edited (ignored in the checks). */
  @IsOptional()
  @IsString()
  excludeId?: string;

  /** Length of the free slots to propose (default: one period). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;
}

export class SwapDto {
  @IsString()
  otherId!: string;
}

export class LockDto {
  @IsBoolean()
  locked!: boolean;
}

export class LockClassDto {
  @IsString()
  classId!: string;

  @IsBoolean()
  locked!: boolean;
}

export class GenerateScopeDto {
  @IsIn(['all', 'level', 'class'])
  scope!: 'all' | 'level' | 'class';

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;
}

export class GeneratedLessonDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  teacherId!: string;

  @IsOptional()
  @IsString()
  roomId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  endTime!: string;
}

export class GenerateApplyDto extends GenerateScopeDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => GeneratedLessonDto)
  lessons!: GeneratedLessonDto[];
}

export class HistoryQueryDto {
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ExportQueryDto {
  @IsIn(['pdf', 'xlsx'])
  format!: 'pdf' | 'xlsx';

  @IsIn(['class', 'teacher', 'room'])
  view!: 'class' | 'teacher' | 'room';

  /** One class/teacher/room; all of them when omitted. */
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;
}
