// Server tests and the E2E API run against the dedicated test database only.
// Refuse to continue when DATABASE_URL does not name a database ending in _test.
export function assertTestDatabaseUrl(databaseUrl: string | undefined): void {
  let databaseName = '';
  try {
    databaseName = new URL(databaseUrl ?? '').pathname.slice(1);
  } catch {
    // Reported below.
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error('Tests need .env.test with a DATABASE_URL whose database name ends in _test.');
  }
}

type RawClient = {
  $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (query: string) => Promise<number>;
};

// Empties every application table and restarts its identity, keeping the migration history.
// Used by the server tests and the E2E seed, both on the test database only.
export async function resetDatabase(prisma: RawClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) {
    return;
  }
  const names = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
