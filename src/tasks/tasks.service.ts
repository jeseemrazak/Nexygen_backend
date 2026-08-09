import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const DETAIL_INCLUDE = {
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
};

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTaskDto) {
    return this.prisma.task.create({
      data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
      include: DETAIL_INCLUDE,
    });
  }

  async findAll(filters: { assignedToId?: number; status?: string }) {
    const where: any = {};
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;
    return this.prisma.task.findMany({
      where,
      include: DETAIL_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: number) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async update(id: number, dto: UpdateTaskDto) {
    const data: any = { ...dto };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    return this.prisma.task.update({ where: { id }, data, include: DETAIL_INCLUDE });
  }

  async remove(id: number) {
    return this.prisma.task.delete({ where: { id } });
  }
}
