import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function checkDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

// Ready means at least one migration exists and none is half applied or rolled back.
export async function checkReady(): Promise<void> {
  const rows = await prisma.$queryRaw<{ total: bigint; unfinished: bigint }[]>`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) AS unfinished
    FROM _prisma_migrations`;
  const { total, unfinished } = rows[0] ?? { total: 0n, unfinished: 0n };
  if (total === 0n || unfinished > 0n) {
    throw new Error('Migrations are missing or not finished.');
  }
}
