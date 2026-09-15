import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

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
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsIn(METHODS)
  method!: (typeof METHODS)[number];

  @IsOptional()
  @IsString()
  reference?: string;
}
