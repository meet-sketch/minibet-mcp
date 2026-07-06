import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const prismaClient = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});
