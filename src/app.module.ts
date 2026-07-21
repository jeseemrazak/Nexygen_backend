import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrdersModule } from './orders/orders.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { InventoryModule } from './inventory/inventory.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { BillsModule } from './bills/bills.module';
import { QuotationsModule } from './quotations/quotations.module';
import { RfqsModule } from './rfqs/rfqs.module';
import { AccountingModule } from './accounting/accounting.module';
import { ExpensesModule } from './expenses/expenses.module';
import { PartyPaymentsModule } from './party-payments/party-payments.module';
import { PosModule } from './pos/pos.module';
import { PayrollModule } from './payroll/payroll.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';


@Module({
  imports: [
    OrdersModule,
    SalesOrdersModule,
    DeliveriesModule,
    InvoicesModule,
    PrismaModule,
    ProductsModule,
    UsersModule,
    AuthModule,
    WarehousesModule,
    InventoryModule,
    SuppliersModule,
    PurchaseOrdersModule,
    ReceiptsModule,
    BillsModule,
    QuotationsModule,
    RfqsModule,
    AccountingModule,
    ExpensesModule,
    PartyPaymentsModule,
    PosModule,
    PayrollModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
