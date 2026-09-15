import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

const STATUSES = ['PRESENT', 'ABSENT', 'RETARD', 'ABSENCE_JUSTIFIEE'] as const;

class AttendanceRecordDto {
  @IsString()
  studentId!: string;

  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}

export class MarkAttendanceDto {
  @IsString()
  classId!: string;

  @IsDateString()
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records!: AttendanceRecordDto[];
}
