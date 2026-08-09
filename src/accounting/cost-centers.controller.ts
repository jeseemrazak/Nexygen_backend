import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { CostCentersService } from './cost-centers.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('accounting/cost-centers')
export class CostCentersController {
  constructor(private readonly costCentersService: CostCentersService) {}

  @Post()
  create(@Body() dto: CreateCostCenterDto) {
    return this.costCentersService.create(dto);
  }

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.costCentersService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.costCentersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCostCenterDto) {
    return this.costCentersService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.costCentersService.remove(+id);
  }
}
