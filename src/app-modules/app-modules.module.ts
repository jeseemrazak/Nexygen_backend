import { Module } from '@nestjs/common';
import { AppModulesService } from './app-modules.service';
import { AppModulesController } from './app-modules.controller';

@Module({
  providers: [AppModulesService],
  controllers: [AppModulesController],
  exports: [AppModulesService],
})
export class AppModulesModule {}
