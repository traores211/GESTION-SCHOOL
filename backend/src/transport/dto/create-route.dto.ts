import { IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateRouteDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  departureTime?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  monthlyFee?: number;
}
