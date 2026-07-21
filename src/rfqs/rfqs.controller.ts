import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { CreateRfqResponseDto } from './dto/create-rfq-response.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('rfqs')
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() createRfqDto: CreateRfqDto) {
    return this.rfqsService.create(createRfqDto);
  }

  @Get()
  findAll(@Query('status') status?: string) {
    return this.rfqsService.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rfqsService.findOne(+id);
  }

  @Roles('ADMIN')
  @Post(':id/responses')
  createResponse(@Param('id') id: string, @Body() dto: CreateRfqResponseDto) {
    return this.rfqsService.createResponse(+id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/responses/:responseId/convert-to-po')
  convertToPurchaseOrder(@Param('id') id: string, @Param('responseId') responseId: string) {
    return this.rfqsService.convertToPurchaseOrder(+id, +responseId);
  }
}
