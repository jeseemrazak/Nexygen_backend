import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AppModulesModule } from '../app-modules/app-modules.module';

@Module({
  imports: [AppModulesModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
