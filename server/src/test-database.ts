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
