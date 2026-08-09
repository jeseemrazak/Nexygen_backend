import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

const DETAIL_INCLUDE = {
  assignedTo: { select: { id: true, name: true, email: true } },
  convertedCustomer: true,
  appointments: { orderBy: { appointmentAt: 'desc' as const } },
};

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateLeadDto) {
    return this.prisma.lead.create({ data: dto, include: DETAIL_INCLUDE });
  }

  async findAll(stage?: string) {
    return this.prisma.lead.findMany({
      where: stage && stage !== 'ALL' ? { stage: stage as any } : undefined,
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    return lead;
  }

  async update(id: number, dto: UpdateLeadDto) {
    return this.prisma.lead.update({ where: { id }, data: dto, include: DETAIL_INCLUDE });
  }

  async remove(id: number) {
    return this.prisma.lead.delete({ where: { id } });
  }

  // Converts a won Lead into a real Customer — the Lead row stays for history, it just gets
  // pointed at the Customer it became (and is bumped to WON if it wasn't already). A Lead can
  // only convert once, enforced by the unique convertedCustomerId column.
  async convertToCustomer(id: number) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    if (lead.convertedCustomerId) {
      throw new BadRequestException(`Lead ${id} has already been converted to a Customer`);
    }

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: lead.name,
          contactPerson: lead.contactPerson,
          phone: lead.phone,
          email: lead.email,
          address: lead.address,
        },
      });
      return tx.lead.update({
        where: { id },
        data: { convertedCustomerId: customer.id, stage: 'WON' },
        include: DETAIL_INCLUDE,
      });
    });
  }
}
