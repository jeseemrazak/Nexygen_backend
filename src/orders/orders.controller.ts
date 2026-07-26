import { Controller, Get, Patch, Body, Param, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrdersService } from './orders.service';
import { DeliveryStatus } from '@prisma/client';
import { assertValidImageFile } from '../common/file-validation';

// Backward-compatibility shim — see orders.service.ts. Only the 4 routes the mobile app and
// dashboard home page actually call. Everything else lives in sales-orders/deliveries/invoices now.
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('dashboard/summary')
  async getDashboardSummary(@Query() query: any) {
    return this.ordersService.getDashboardSummary(query);
  }

  @Get('merchandisers')
  getMerchandisers() {
    return this.ordersService.getMerchandisers();
  }

  @Get('merchandiser/:id')
  getMerchandiserOrders(@Param('id') id: string) {
    return this.ordersService.getOrdersByMerchandiser(Number(id));
  }

  @Patch(':id/status')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/signatures',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `Order${req.params.id}-${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
        return cb(new BadRequestException('Only JPEG, PNG, or WEBP images are allowed'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  updateOrderStatus(
    @Param('id') id: string,
    @Body('status') status: DeliveryStatus,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) assertValidImageFile(file.path);
    const filePath = file ? `/uploads/signatures/${file.filename}` : null;
    return this.ordersService.updateOrderStatus(Number(id), status, filePath);
  }
}
