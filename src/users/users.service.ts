import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

// 🔥 1. Create a new Merchandiser
  async createMerchandiser(data: any) {
    // Check if email is already taken
    const existingUser = await this.prisma.user.findUnique({ 
      where: { email: data.email } 
    });
    
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    // 🔥 THIS ENCRYPTS THE PASSWORD EXACTLY HOW AUTH.SERVICE EXPECTS IT
    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword, // 👈 Saving the encrypted version!
        role: 'MERCHANDISER',
      },
      // We don't return the password back to the frontend for security
      select: { id: true, name: true, email: true, role: true, createdAt: true } 
    });
  }

  // Every user regardless of role — backs staff-assignment dropdowns (CRM Leads/Appointments,
  // Tasks) where an ADMIN office user is just as valid an assignee as a MERCHANDISER.
  async getAll() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  // 🔥 2. Get all Merchandisers for the dashboard list
  async getMerchandisers() {
    return this.prisma.user.findMany({
      where: { role: 'MERCHANDISER' },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  // 🔥 3. Edit a merchandiser's details, and/or reset their password — password is only
  // rehashed when the admin actually supplied a new one, same "optional credential in the
  // profile-update DTO" pattern as PosStaffService.update().
  async updateMerchandiser(id: number, data: { name?: string; email?: string; password?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'MERCHANDISER') {
      throw new NotFoundException(`Merchandiser ${id} not found`);
    }

    if (data.email && data.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existing) throw new ConflictException('A user with this email already exists.');
    }

    const updateData: any = { name: data.name, email: data.email };
    if (data.password) updateData.password = await bcrypt.hash(data.password, 10);

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  }
}

  