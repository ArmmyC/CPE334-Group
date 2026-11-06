import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { assertTestDatabaseUrl } from '../src/test-database.js';

// Apply all migrations to the test database once before any server test runs.
export default function setup(): void {
  config({
    path: fileURLToPath(new URL('../../.env.test', import.meta.url)),
    override: true,
    quiet: true,
  });
  assertTestDatabaseUrl(process.env.DATABASE_URL);

  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: process.env,
    stdio: 'pipe',
  });
}
