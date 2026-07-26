import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { JobOrdersService } from './job-orders.service';
import { CreateJobOrderDto } from './dto/create-job-order.dto';
import { UpdateJobOrderDto } from './dto/update-job-order.dto';
import { AddJobOrderPartDto } from './dto/add-part.dto';
import { AddJobOrderLaborDto } from './dto/add-labor.dto';
import { UpdateJobOrderStatusDto } from './dto/update-status.dto';

@Controller('job-orders')
export class JobOrdersController {
  constructor(private readonly service: JobOrdersService) {}

  @Post()
  create(@Body() dto: CreateJobOrderDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('vehicleId') vehicleId?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll({
      vehicleId: vehicleId ? +vehicleId : undefined,
      customerId: customerId ? +customerId : undefined,
      status,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobOrderDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobOrderStatusDto) {
    return this.service.updateStatus(id, dto.status);
  }

  @Post(':id/parts')
  addPart(@Param('id', ParseIntPipe) id: number, @Body() dto: AddJobOrderPartDto) {
    return this.service.addPart(id, dto);
  }

  @Delete(':id/parts/:partId')
  removePart(@Param('id', ParseIntPipe) id: number, @Param('partId', ParseIntPipe) partId: number) {
    return this.service.removePart(id, partId);
  }

  @Post(':id/labor')
  addLabor(@Param('id', ParseIntPipe) id: number, @Body() dto: AddJobOrderLaborDto) {
    return this.service.addLabor(id, dto);
  }

  @Delete(':id/labor/:laborId')
  removeLabor(@Param('id', ParseIntPipe) id: number, @Param('laborId', ParseIntPipe) laborId: number) {
    return this.service.removeLabor(id, laborId);
  }
}
