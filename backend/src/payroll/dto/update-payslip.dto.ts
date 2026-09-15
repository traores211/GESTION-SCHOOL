import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdatePayslipDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  bonuses?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deductions?: number;
}
