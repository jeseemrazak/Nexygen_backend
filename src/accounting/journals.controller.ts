import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { JournalsService } from './journals.service';
import { CreateJournalDto } from './dto/create-journal.dto';
import { UpdateJournalDto } from './dto/update-journal.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('accounting/journals')
export class JournalsController {
  constructor(private readonly journalsService: JournalsService) {}

  @Post()
  create(@Body() dto: CreateJournalDto) {
    return this.journalsService.create(dto);
  }

  @Post('seed-defaults')
  seedDefaults() {
    return this.journalsService.seedDefaults();
  }

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.journalsService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.journalsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateJournalDto) {
    return this.journalsService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.journalsService.remove(+id);
  }
}
