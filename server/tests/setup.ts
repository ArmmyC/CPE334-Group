import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Server tests run against the dedicated test database only. Refuse to start
// when DATABASE_URL does not name a database ending in _test.
config({
  path: fileURLToPath(new URL('../../.env.test', import.meta.url)),
  override: true,
  quiet: true,
});

const databaseUrl = process.env.DATABASE_URL;
let databaseName = '';
try {
  databaseName = new URL(databaseUrl ?? '').pathname.slice(1);
} catch {
  // Reported below.
}
if (!databaseName.endsWith('_test')) {
  throw new Error('Tests need .env.test with a DATABASE_URL whose database name ends in _test.');
}
