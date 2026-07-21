import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg'; // <--- Name updated here
import * as dotenv from 'dotenv';

// Force the system to read your .env file immediately
dotenv.config();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // Grab the exact URL from the .env file
    const connectionString = process.env.DATABASE_URL;
    
    // Pass it securely to the Postgres adapter
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool); // <--- Name updated here
    
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}