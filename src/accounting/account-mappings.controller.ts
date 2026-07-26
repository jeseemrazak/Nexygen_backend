import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { AccountMappingsService } from './account-mappings.service';
import { UpdateAccountMappingDto } from './dto/update-account-mapping.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('accounting/account-mappings')
export class AccountMappingsController {
  constructor(private readonly accountMappingsService: AccountMappingsService) {}

  @Get()
  findAll() {
    return this.accountMappingsService.findAll();
  }

  @Patch(':role')
  update(@Param('role') role: AccountMappingRole, @Body() dto: UpdateAccountMappingDto) {
    return this.accountMappingsService.update(role, dto.accountId);
  }
}
