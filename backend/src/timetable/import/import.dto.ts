import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TIME_PATTERN } from '../domain/time';

export class ImportRowDto {
  @IsString()
  @MaxLength(20)
  id!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number | null;

  @IsOptional()
  @Matches(TIME_PATTERN)
  startTime?: string | null;

  @IsOptional()
  @Matches(TIME_PATTERN)
  endTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  className?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subjectName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  teacherName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roomName?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(40)
  hoursPerWeek?: number | null;
}

export class EntityDecisionDto {
  @IsIn(['class', 'subject', 'teacher', 'room'])
  kind!: 'class' | 'subject' | 'teacher' | 'room';

  @IsString()
  @MaxLength(120)
  raw!: string;

  @IsIn(['match', 'create', 'ignore'])
  action!: 'match' | 'create' | 'ignore';

  @IsOptional()
  @IsString()
  id?: string | null;
}

export class ImportCommitDto {
  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @MaxLength(40)
  fileType!: string;

  @IsString()
  @MaxLength(20)
  method!: string;

  /** append: keep existing sessions; replace: first remove the sessions of the imported classes (same period). */
  @IsIn(['append', 'replace'])
  mode!: 'append' | 'replace';

  @IsOptional()
  @IsString()
  termId?: string | null;

  @IsOptional()
  @IsBoolean()
  allowConflicts?: boolean;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => EntityDecisionDto)
  entities!: EntityDecisionDto[];
}
