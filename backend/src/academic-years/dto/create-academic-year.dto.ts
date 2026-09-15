import { IsDateString, IsString, MinLength } from 'class-validator';

export class CreateAcademicYearDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
