import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: {
        ...dto,
        qidExpiryDate: dto.qidExpiryDate ? new Date(dto.qidExpiryDate) : undefined,
        passportExpiryDate: dto.passportExpiryDate ? new Date(dto.passportExpiryDate) : undefined,
        visaExpiryDate: dto.visaExpiryDate ? new Date(dto.visaExpiryDate) : undefined,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
      },
    });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.employee.findMany({
      where: activeOnly ? { payrollActive: true } : undefined,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } }, loans: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async update(id: number, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);

    return this.prisma.employee.update({
      where: { id },
      data: {
        ...dto,
        qidExpiryDate: dto.qidExpiryDate ? new Date(dto.qidExpiryDate) : undefined,
        passportExpiryDate: dto.passportExpiryDate ? new Date(dto.passportExpiryDate) : undefined,
        visaExpiryDate: dto.visaExpiryDate ? new Date(dto.visaExpiryDate) : undefined,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
      },
    });
  }

  async remove(id: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return this.prisma.employee.delete({ where: { id } });
  }
}
