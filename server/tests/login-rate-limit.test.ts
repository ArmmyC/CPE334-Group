import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import {
  MINUTE,
  createAccount,
  createTestApp,
  fixedClock,
  logIn,
  testPassword,
} from './helpers/app.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const wrong = 'wrong-password-1';

async function fail(app: ReturnType<typeof createTestApp>, email: string, times: number) {
  const statuses: number[] = [];
  for (let i = 0; i < times; i += 1) {
    statuses.push((await logIn(app, email, wrong)).status);
  }
  return statuses;
}

async function setUp() {
  const clock = fixedClock(new Date('2026-11-10T05:00:00.000Z'));
  const app = createTestApp({ clock });
  const borrower = await createAccount('BORROWER');
  return { app, clock, borrower };
}

describe('TEST-F15-01 ten failures lock the email (AC-F15-01, NFR-06)', () => {
  it('refuses the 11th attempt with 429 even with the correct password, and creates no session', async () => {
    const { app, borrower } = await setUp();

    expect(await fail(app, borrower.email, 10)).toEqual(Array(10).fill(401));
    const locked = await logIn(app, borrower.email, testPassword);

    expect(locked.status).toBe(429);
    expect(apiErrorSchema.parse(locked.body).error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(await prisma.session.count({ where: { userId: borrower.id } })).toBe(0);
  });
});

describe('TEST-F15-02 a success before the limit resets the count (AC-F15-02, NFR-06)', () => {
  it('lets a correct login through after 9 failures, and restarts the count', async () => {
    const { app, clock, borrower } = await setUp();

    await fail(app, borrower.email, 9);
    expect((await logIn(app, borrower.email)).status).toBe(200);
    // The later failures are one tick after the success, so only a real reset lets 10 of them lock.
    clock.advance(1);
    await fail(app, borrower.email, 9);
    expect((await logIn(app, borrower.email)).status).toBe(200);
    clock.advance(1);
    await fail(app, borrower.email, 10);

    expect((await logIn(app, borrower.email)).status).toBe(429);
  });
});

describe('TEST-F15-03 the lock ends with the window (AC-F15-03, NFR-06)', () => {
  it('accepts a correct login 15 minutes after the failures, and not one minute before', async () => {
    const { app, clock, borrower } = await setUp();
    await fail(app, borrower.email, 10);

    clock.advance(15 * MINUTE - 1);
    expect((await logIn(app, borrower.email)).status).toBe(429);
    clock.advance(1);

    expect((await logIn(app, borrower.email)).status).toBe(200);
  });
});

describe('TEST-F15-04 refused attempts are not recorded (AC-F15-04, NFR-06)', () => {
  it('keeps the row count and the end of the lock when more attempts arrive', async () => {
    const { app, clock, borrower } = await setUp();
    await fail(app, borrower.email, 10);
    const rows = await prisma.loginAttempt.count();

    for (const minutes of [3, 6, 9]) {
      clock.set(new Date(new Date('2026-11-10T05:00:00.000Z').getTime() + minutes * MINUTE));
      expect((await logIn(app, borrower.email, wrong)).status).toBe(429);
    }

    expect(await prisma.loginAttempt.count()).toBe(rows);
    clock.set(new Date(new Date('2026-11-10T05:00:00.000Z').getTime() + 15 * MINUTE));
    expect((await logIn(app, borrower.email)).status).toBe(200);
  });
});

describe('TEST-F15-05 the count is per email (AC-F15-05, NFR-06)', () => {
  it('does not lock another email, ignores case, and counts unknown emails', async () => {
    const { app, borrower } = await setUp();
    const other = await createAccount('BORROWER');

    for (let i = 0; i < 10; i += 1) {
      const email = i % 2 === 0 ? borrower.email.toUpperCase() : borrower.email;
      await logIn(app, email, wrong);
    }
    const unknown = await fail(app, 'nobody@example.test', 10);

    expect((await logIn(app, borrower.email)).status).toBe(429);
    expect((await logIn(app, other.email)).status).toBe(200);
    expect(unknown).toEqual(Array(10).fill(401));
    expect((await logIn(app, 'nobody@example.test', wrong)).status).toBe(429);
  });
});

describe('TEST-F15-06 the 429 answer (AC-F15-06, NFR-06)', () => {
  it('has the shared error shape and a Retry-After header in seconds', async () => {
    const { app, clock, borrower } = await setUp();
    await fail(app, borrower.email, 10);
    clock.advance(5 * MINUTE);

    const locked = await logIn(app, borrower.email);

    expect(locked.status).toBe(429);
    expect(apiErrorSchema.parse(locked.body).error.code).toBe('TOO_MANY_ATTEMPTS');
    const retryAfter = Number(locked.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBe(10 * 60);
  });
});

describe('TEST-F15-08 the sliding window with staggered failures (AC-F15-03, NFR-06)', () => {
  it('counts the 10 most recent failures and unlocks when the 10th most recent is 15 minutes old', async () => {
    const { app, clock, borrower } = await setUp();
    // 12 failures, one every minute: the lock starts at the 10th and the 11th and 12th are refused.
    for (let i = 0; i < 10; i += 1) {
      expect((await logIn(app, borrower.email, wrong)).status).toBe(401);
      clock.advance(MINUTE);
    }
    // Now 10 minutes after the first failure. The oldest failure is 10 minutes old.
    const locked = await logIn(app, borrower.email);
    expect(locked.status).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBe(5 * 60);

    clock.advance(5 * MINUTE - 1);
    expect((await logIn(app, borrower.email)).status).toBe(429);
    clock.advance(1);
    expect((await logIn(app, borrower.email)).status).toBe(200);
  });
});

describe('TEST-F15-09 a parallel burst cannot pass the limit (AC-F15-01, NFR-06)', () => {
  it('lets exactly 10 of 30 parallel wrong passwords reach the password check', async () => {
    const { app, borrower } = await setUp();

    const responses = await Promise.all(
      Array.from({ length: 30 }, () => logIn(app, borrower.email, wrong)),
    );

    expect(responses.filter((r) => r.status === 401)).toHaveLength(10);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(20);
    expect(await prisma.loginAttempt.count()).toBe(10);
  });
});
