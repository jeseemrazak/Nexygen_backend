import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { RedeemPointsDto } from './dto/redeem-points.dto';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly service: LoyaltyService) {}

  // No @Roles — POS checkout (any authenticated dashboard session) needs to read a customer's
  // balance before offering redemption, same trust boundary as the rest of the POS endpoints.
  @Get('customers/:id')
  getCustomerSummary(@Param('id', ParseIntPipe) id: number) {
    return this.service.getCustomerSummary(id);
  }

  @Post('redeem')
  redeem(@Body() dto: RedeemPointsDto) {
    return this.service.redeem(dto.customerId, dto.points);
  }
}
