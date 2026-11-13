import './config.js';
import { assertTestDatabaseUrl } from './test-database.js';

// Runs before `prisma migrate deploy` in the e2e:seed script, so a database that is not a
// test database is never migrated. The same check runs again inside e2e-seed.ts.
assertTestDatabaseUrl(process.env.DATABASE_URL);
