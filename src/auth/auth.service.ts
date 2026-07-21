import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service'; // Ensure this path matches your folder structure

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  // 1. One-time function to create the Master Admin
  async bootstrapAdmin(data: any) {
    const existingAdmin = await this.prisma.user.findFirst({ 
      where: { role: 'ADMIN' } 
    });
    
    if (existingAdmin) {
      throw new BadRequestException('An Admin already exists! Bootstrap locked.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const admin = await this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: 'ADMIN',
      },
    });

    const { password, ...safeAdmin } = admin;
    return safeAdmin;
  }

  // 2. The Login Function
  async login(email: string, pass: string) {
    // Look up the user by email
    const user = await this.prisma.user.findUnique({ 
      where: { email } 
    });
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Securely compare the provided password against the hashed database password
    const isPasswordValid = await bcrypt.compare(pass, user.password);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Create the Digital ID Badge (JWT) Payload
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role 
    };
    
    // 4. Return the Token and User Data
    return {
      access_token: await this.jwtService.signAsync(payload),
      // 🔥 Exposed at the top level so the mobile app can grab it instantly
      id: user.id, 
      // Maintained for the Next.js web dashboard context
      user: { 
        id: user.id, 
        name: user.name, 
        role: user.role, 
        email: user.email 
      }
    };
  }
}