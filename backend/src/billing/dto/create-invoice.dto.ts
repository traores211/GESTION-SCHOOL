import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsPositive, IsString, Max, MaxLength, MinLength, ValidateNested } from 'class-validator';

class InvoiceItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  /** Whole francs CFA. */
  @IsInt({ message: 'Montant en francs CFA entiers' })
  @IsPositive()
  @Max(100_000_000)
  amount!: number;
}

export class CreateInvoiceDto {
  @IsString()
  studentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsDateString()
  dueDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}
