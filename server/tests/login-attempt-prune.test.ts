import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { MINUTE, createAccount, createTestApp, fixedClock, logIn } from './helpers/app.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const NOW = new Date('2026-11-10T05:00:00.000Z');
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * MINUTE);

describe('TEST-HARDEN-03 login attempts older than the window are deleted (NFR-06)', () => {
  it('deletes attempts older than 15 minutes for every email and keeps the recent ones', async () => {
    const app = createTestApp({ clock: fixedClock(NOW) });
    const borrower = await createAccount('BORROWER');
    await prisma.loginAttempt.createMany({
      data: [
        { email: borrower.email, attemptedAt: at(16), succeeded: false },
        { email: borrower.email, attemptedAt: at(60), succeeded: true },
        { email: 'someone.else@example.test', attemptedAt: at(30), succeeded: false },
        { email: 'nobody@example.test', attemptedAt: at(24 * 60), succeeded: false },
        { email: borrower.email, attemptedAt: at(14), succeeded: false },
        { email: 'someone.else@example.test', attemptedAt: at(1), succeeded: false },
      ],
    });

    const response = await logIn(app, borrower.email, 'wrong-password-1');

    expect(response.status).toBe(401);
    const rows = await prisma.loginAttempt.findMany({ orderBy: { attemptedAt: 'asc' } });
    expect(rows.map((row) => [row.email, row.attemptedAt.getTime()])).toEqual([
      [borrower.email, at(14).getTime()],
      ['someone.else@example.test', at(1).getTime()],
      [borrower.email, NOW.getTime()],
    ]);
  });

  it('keeps the lock exactly as before: 10 recent failures still lock the email', async () => {
    const clock = fixedClock(NOW);
    const app = createTestApp({ clock });
    const borrower = await createAccount('BORROWER');
    await prisma.loginAttempt.createMany({
      data: [
        ...Array.from({ length: 10 }, (_, i) => ({
          email: borrower.email,
          attemptedAt: at(1 + i),
          succeeded: false,
        })),
        { email: borrower.email, attemptedAt: at(40), succeeded: false },
      ],
    });

    const response = await logIn(app, borrower.email);

    expect(response.status).toBe(429);
    // The 429 is refused before anything is written, and the old row is still pruned or kept
    // without changing the count of recent rows.
    const recent = await prisma.loginAttempt.count({ where: { attemptedAt: { gt: at(15) } } });
    expect(recent).toBe(10);
  });
});
