import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { AppModulesService } from './app-modules.service';
import { UpdateModuleConfigDto } from './dto/update-module-config.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('app-modules')
export class AppModulesController {
  constructor(private readonly service: AppModulesService) {}

  // No @Roles — the App Store listing (with each module's installed/active state) is visible
  // to any authenticated user, same convention as GET /settings/company.
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.service.findOne(key);
  }

  @Roles('ADMIN')
  @Post(':key/install')
  install(@Param('key') key: string) {
    return this.service.install(key);
  }

  @Roles('ADMIN')
  @Post(':key/uninstall')
  uninstall(@Param('key') key: string) {
    return this.service.uninstall(key);
  }

  @Roles('ADMIN')
  @Patch(':key/config')
  updateConfig(@Param('key') key: string, @Body() dto: UpdateModuleConfigDto) {
    return this.service.updateConfig(key, dto.config);
  }
}
