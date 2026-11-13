import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

// Prisma 7 needs a driver adapter. `max` replaces `connection_limit` in the URL, which the pg
// adapter does not read.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 });

export const prisma = new PrismaClient({ adapter });

export async function checkDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
