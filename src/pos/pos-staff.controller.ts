import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { PosStaffService } from './pos-staff.service';
import { CreatePosStaffDto } from './dto/create-pos-staff.dto';
import { UpdatePosStaffDto } from './dto/update-pos-staff.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('pos-staff')
export class PosStaffController {
  constructor(private readonly service: PosStaffService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreatePosStaffDto) {
    return this.service.create(dto);
  }

  // Read access (findAll/findOne) stays open to any authenticated user — the checkout page's
  // staff-login PIN pad needs the staff list to populate its dropdown, and it's not a login,
  // just per-sale attribution (verify-pin below is the actual PIN check).
  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePosStaffDto) {
    return this.service.update(+id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }

  @Post(':id/verify-pin')
  verifyPin(@Param('id') id: string, @Body() dto: VerifyPinDto) {
    return this.service.verifyPin(+id, dto);
  }
}
