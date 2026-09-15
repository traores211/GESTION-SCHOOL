import { PartialType } from '@nestjs/swagger';
import { CreateStudentDto } from './create-student.dto';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  @IsOptional()
  @IsIn(['INSCRIT', 'PRESENT', 'RETIRE', 'DIPLOME', 'REDOUBLANT'])
  status?: string;
}
