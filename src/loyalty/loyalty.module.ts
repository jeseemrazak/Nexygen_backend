import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { AppModulesModule } from '../app-modules/app-modules.module';

@Module({
  imports: [AppModulesModule],
  providers: [LoyaltyService],
  controllers: [LoyaltyController],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
