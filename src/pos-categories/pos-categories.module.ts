import { Module } from '@nestjs/common';
import { PosCategoriesService } from './pos-categories.service';
import { PosCategoriesController } from './pos-categories.controller';

@Module({
  controllers: [PosCategoriesController],
  providers: [PosCategoriesService],
})
export class PosCategoriesModule {}
