import { Injectable, ConflictException } from '@nestjs/common';
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

  // 🔥 2. Get all Merchandisers for the dashboard list
  async getMerchandisers() {
    return this.prisma.user.findMany({
      where: { role: 'MERCHANDISER' },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
  }
}

  