import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { TIME_PATTERN } from '../domain/time';

class QualificationDto {
  @IsString()
  subjectId!: string;

  @IsString()
  @MaxLength(60)
  level!: string;

  @IsOptional()
  @IsString()
  classId?: string | null;
}

class AvailabilityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @Matches(TIME_PATTERN)
  startTime!: string;

  @Matches(TIME_PATTERN)
  endTime!: string;
}

class TeacherPlanningDto {
  @IsString()
  teacherId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  matricule?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60 * 60)
  weeklyMaxMinutes?: number | null;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => QualificationDto)
  qualifications!: QualificationDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityDto)
  availability!: AvailabilityDto[];
}

class VolumeDto {
  @IsString()
  @MaxLength(60)
  level!: string;

  @IsString()
  subjectId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40 * 60)
  minutesPerWeek!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(8 * 60)
  maxSessionMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  coefficient?: number | null;
}

export class PlanningCommitDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => TeacherPlanningDto)
  teachers!: TeacherPlanningDto[];

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => VolumeDto)
  volumes!: VolumeDto[];
}
