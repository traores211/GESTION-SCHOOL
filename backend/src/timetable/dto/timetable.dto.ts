import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TIME_PATTERN } from '../domain/time';
import { SLOT_OPTIONS } from '../domain/grid';

const TIME_MESSAGE = 'Horaire attendu au format HH:MM (ex. 08:30)';

export class SessionDto {
  @IsString()
  classId!: string;

  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @IsOptional()
  @IsString()
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  roomId?: string | null;

  @IsOptional()
  @IsString()
  termId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  /** Save even if the slot has blocking conflicts (they stay flagged in the editor). */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class UpdateSessionDto extends PartialType(SessionDto) {}

export class CheckSlotDto extends SessionDto {
  /** Session being edited: excluded from the comparison. */
  @IsOptional()
  @IsString()
  id?: string;
}

export class DuplicateSessionDto {
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
  @IsString()
  classId?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class TimetableQueryDto {
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  roomId?: string;
}

export class RoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  type?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  capacity?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  building?: string | null;

  /** Specialised room: the subjects that must use it (empty = ordinary room). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  subjectIds?: string[];
}

export class UpdateRoomDto extends PartialType(RoomDto) {}

export class HalfDayDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  day!: number;

  @IsIn(['AM', 'PM'])
  half!: 'AM' | 'PM';
}

export class TimetableSettingsDto {
  /** Year to configure (current year by default). */
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(14)
  @ValidateNested({ each: true })
  @Type(() => HalfDayDto)
  freeHalfDays?: HalfDayDto[];

  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  halfDaySplit?: string;

  /** Daily maximums in official hours (null = no maximum). */
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(14)
  maxClassHoursPerDay?: number | null;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(14)
  maxTeacherHoursPerDay?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn([1, 2, 3, 4, 5, 6, 7], { each: true })
  days?: number[];

  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  start?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  end?: string;

  /** "12:00-14:00, 10:00-10:15" */
  @IsOptional()
  @IsString()
  @Matches(/^\s*$|^(\s*([01]\d|2[0-3]):[0-5]\d\s*-\s*([01]\d|2[0-3]):[0-5]\d\s*)(,\s*([01]\d|2[0-3]):[0-5]\d\s*-\s*([01]\d|2[0-3]):[0-5]\d\s*)*$/, {
    message: 'Pauses attendues au format "12:00-14:00, 10:00-10:15"',
  })
  breaks?: string;

  @IsOptional()
  @IsIn(SLOT_OPTIONS, { message: `Durée de créneau autorisée : ${SLOT_OPTIONS.join(', ')} minutes` })
  slotMinutes?: number;
}
