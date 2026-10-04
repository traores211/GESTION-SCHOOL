import { Module } from '@nestjs/common';
import { BulletinsModule } from '../bulletins/bulletins.module';
import { PromotionController } from './promotion.controller';
import { PromotionService } from './promotion.service';

@Module({
  imports: [BulletinsModule],
  controllers: [PromotionController],
  providers: [PromotionService],
})
export class PromotionModule {}
