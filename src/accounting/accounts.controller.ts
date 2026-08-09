import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('accounting/accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }

  @Post('seed-defaults')
  seedDefaults() {
    return this.accountsService.seedDefaults();
  }

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.accountsService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.accountsService.remove(+id);
  }

  @Get(':id/ledger')
  getLedger(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accountsService.getLedger(+id, from, to);
  }
}
