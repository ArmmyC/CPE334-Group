import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { assertTestDatabaseUrl } from '../src/test-database.js';

config({
  path: fileURLToPath(new URL('../../.env.test', import.meta.url)),
  override: true,
  quiet: true,
});

assertTestDatabaseUrl(process.env.DATABASE_URL);
