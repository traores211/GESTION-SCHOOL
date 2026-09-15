import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsPositive, IsString, MinLength, ValidateNested } from 'class-validator';

class InvoiceItemDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class CreateInvoiceDto {
  @IsString()
  studentId!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsDateString()
  dueDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}
