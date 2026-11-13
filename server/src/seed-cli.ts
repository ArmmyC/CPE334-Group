import './config.js';
import { prisma } from './db.js';
import { seed } from './seed.js';

// Entry point for `npm run db:seed` and the Lab 5 migration job. Never prints a password.
try {
  const created = await seed(prisma, process.env);
  console.log(
    `Seed complete. Created ${created.labs} labs, ${created.users} users, ${created.types} equipment types, ${created.copies} copies, and ${created.loans} sample loans.`,
  );
} catch (error) {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
