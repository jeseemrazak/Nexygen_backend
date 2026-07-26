import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';

@Injectable()
export class ProductCategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductCategoryDto) {
    return this.prisma.productCategory.create({ data: dto });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.productCategory.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async update(id: number, dto: Partial<CreateProductCategoryDto>) {
    const category = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Product category ${id} not found`);
    return this.prisma.productCategory.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const count = await this.prisma.product.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new BadRequestException(`Cannot delete category — it has ${count} product(s) assigned to it. Deactivate it instead.`);
    }
    return this.prisma.productCategory.delete({ where: { id } });
  }
}
