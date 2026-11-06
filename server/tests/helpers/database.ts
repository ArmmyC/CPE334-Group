import { prisma } from '../../src/db.js';
import { resetDatabase as reset } from '../../src/test-database.js';

// Empty every application table and restart its identity, keeping the migration history.
export function resetDatabase(): Promise<void> {
  return reset(prisma);
}
