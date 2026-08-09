import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

const DETAIL_INCLUDE = {
  customer: true,
  lead: true,
  staff: { select: { id: true, name: true, email: true } },
};

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAppointmentDto) {
    return this.prisma.appointment.create({
      data: { ...dto, appointmentAt: new Date(dto.appointmentAt) },
      include: DETAIL_INCLUDE,
    });
  }

  async findAll(filters: { staffId?: number; from?: string; to?: string; status?: string }) {
    const where: any = {};
    if (filters.staffId) where.staffId = filters.staffId;
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters.from || filters.to) {
      where.appointmentAt = {};
      if (filters.from) where.appointmentAt.gte = new Date(filters.from);
      if (filters.to) where.appointmentAt.lte = new Date(filters.to);
    }
    return this.prisma.appointment.findMany({
      where,
      include: DETAIL_INCLUDE,
      orderBy: { appointmentAt: 'asc' },
    });
  }

  async findOne(id: number) {
    const appt = await this.prisma.appointment.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!appt) throw new NotFoundException(`Appointment ${id} not found`);
    return appt;
  }

  async update(id: number, dto: UpdateAppointmentDto) {
    const data: any = { ...dto };
    if (dto.appointmentAt) data.appointmentAt = new Date(dto.appointmentAt);
    return this.prisma.appointment.update({ where: { id }, data, include: DETAIL_INCLUDE });
  }

  async remove(id: number) {
    return this.prisma.appointment.delete({ where: { id } });
  }
}
