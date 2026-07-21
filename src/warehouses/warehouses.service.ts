import { Injectable } from '@nestjs/common';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  async create(createWarehouseDto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: createWarehouseDto,
    });
  }

  async findAll() {
    return this.prisma.warehouse.findMany({
      // 🔥 MAGIC: Fetch all inventory and the associated product names!
      include: {
        inventories: {
          include: { product: true }
        }
      }
    });
  }

  async findOne(id: number) {
    return this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        inventories: {
          include: { product: true }
        }
      }
    });
  }

  async update(id: number, updateWarehouseDto: UpdateWarehouseDto) {
    return this.prisma.warehouse.update({
      where: { id },
      data: updateWarehouseDto,
    });
  }

  async remove(id: number) {
    return this.prisma.warehouse.delete({
      where: { id },
    });
  }
}