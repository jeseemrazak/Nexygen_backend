import { Injectable } from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(createCustomerDto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: createCustomerDto,
    });
  }

  async findAll() {
    return this.prisma.customer.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: {
        salesOrders: { orderBy: { createdAt: 'desc' } },
        quotations: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async update(id: number, updateCustomerDto: UpdateCustomerDto) {
    return this.prisma.customer.update({
      where: { id },
      data: updateCustomerDto,
    });
  }

  async remove(id: number) {
    return this.prisma.customer.delete({
      where: { id },
    });
  }
}
