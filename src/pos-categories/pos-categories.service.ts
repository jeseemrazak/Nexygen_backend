import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePosCategoryDto } from './dto/create-pos-category.dto';

@Injectable()
export class PosCategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePosCategoryDto) {
    return this.prisma.posCategory.create({ data: dto });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.posCategory.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async update(id: number, dto: Partial<CreatePosCategoryDto>) {
    const category = await this.prisma.posCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`POS category ${id} not found`);
    return this.prisma.posCategory.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const count = await this.prisma.product.count({ where: { posCategoryId: id } });
    if (count > 0) {
      throw new BadRequestException(`Cannot delete category — it has ${count} product(s) assigned to it. Deactivate it instead.`);
    }
    return this.prisma.posCategory.delete({ where: { id } });
  }
}
