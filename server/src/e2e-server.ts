import './config.js';
import { assertTestDatabaseUrl } from './test-database.js';

// The E2E API starts only on the test database. Without .env.test, config.ts
// falls back to .env and the check stops the dev database from being used.
assertTestDatabaseUrl(process.env.DATABASE_URL);
await import('./server.js');
