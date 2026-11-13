import './config.js';
import { prisma } from './db.js';
import { seed } from './seed.js';
import { assertTestDatabaseUrl, resetDatabase } from './test-database.js';

// Resets the E2E test database and loads the seed, so every Playwright run starts from the
// same accounts and catalog. It refuses any database whose name does not end in _test.
assertTestDatabaseUrl(process.env.DATABASE_URL);

try {
  await resetDatabase(prisma);
  const created = await seed(prisma, process.env);
  console.log(`E2E seed complete. Created ${created.users} users and ${created.copies} copies.`);
} catch (error) {
  console.error(`E2E seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
