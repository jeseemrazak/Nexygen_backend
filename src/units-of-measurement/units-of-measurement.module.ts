import { Module } from '@nestjs/common';
import { UnitsOfMeasurementService } from './units-of-measurement.service';
import { UnitsOfMeasurementController } from './units-of-measurement.controller';

@Module({
  controllers: [UnitsOfMeasurementController],
  providers: [UnitsOfMeasurementService],
})
export class UnitsOfMeasurementModule {}
