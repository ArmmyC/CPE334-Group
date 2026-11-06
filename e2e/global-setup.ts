import { execSync } from 'node:child_process';
import { e2ePassword } from './seed-data';

// Resets the test database and loads the seed with a known password, so the E2E
// tests can log in as the seeded accounts. The script refuses any database whose
// name does not end in _test.
export default function globalSetup() {
  execSync('npm run e2e:seed', {
    stdio: 'inherit',
    env: { ...process.env, SEED_USER_PASSWORD: e2ePassword },
  });
}
