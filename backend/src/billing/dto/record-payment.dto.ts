import { IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

const METHODS = [
  'CASH',
  'MOBILE_MONEY_ORANGE',
  'MOBILE_MONEY_MTN',
  'MOBILE_MONEY_MOOV',
  'WAVE',
  'BANK_TRANSFER',
  'CHEQUE',
  'CARD',
] as const;

export class RecordPaymentDto {
  /** Whole francs CFA. */
  @IsInt({ message: 'Montant en francs CFA entiers' })
  @IsPositive()
  amount!: number;

  @IsIn(METHODS)
  method!: (typeof METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}
