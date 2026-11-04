import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function checkDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
