import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { PosStaffService } from './pos-staff.service';
import { CreatePosStaffDto } from './dto/create-pos-staff.dto';
import { UpdatePosStaffDto } from './dto/update-pos-staff.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';

@Controller('pos-staff')
export class PosStaffController {
  constructor(private readonly service: PosStaffService) {}

  @Post()
  create(@Body() dto: CreatePosStaffDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePosStaffDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }

  @Post(':id/verify-pin')
  verifyPin(@Param('id') id: string, @Body() dto: VerifyPinDto) {
    return this.service.verifyPin(+id, dto);
  }
}
