import request from 'supertest';
import type { Response } from 'supertest';
import { createApp, type AppDependencies } from '../../src/app.js';
import type { Clock } from '../../src/clock.js';
import { hashPassword } from '../../src/auth/password.js';
import { checkDatabase, checkReady, prisma } from '../../src/db.js';

// The origin the E2E client runs on. API tests send no Origin header unless a test sets one.
export const allowedOrigin = 'http://127.0.0.1:5190';

export const clockStart = new Date('2026-11-07T02:00:00.000Z');

export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;

export type TestClock = Clock & {
  set: (time: Date) => void;
  advance: (milliseconds: number) => void;
};

// A clock the test moves by hand, so session expiry can be checked to the minute (SDS 8).
export function fixedClock(start: Date = clockStart): TestClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    set: (time) => {
      current = time.getTime();
    },
    advance: (milliseconds) => {
      current += milliseconds;
    },
  };
}

export function appDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    prisma,
    checkDatabase,
    checkReady,
    clock: fixedClock(),
    allowedOrigins: [allowedOrigin],
    secureCookies: false,
    ...overrides,
  };
}

export function createTestApp(overrides: Partial<AppDependencies> = {}) {
  return createApp(appDependencies(overrides));
}

export const testPassword = 'correct-password-1';

let counter = 0;

// A user whose password hash is real, so login can verify it.
export async function createAccount(role: 'BORROWER' | 'CUSTODIAN' = 'BORROWER') {
  counter += 1;
  return prisma.user.create({
    data: {
      email: `account${counter}@example.test`,
      name: `Account ${counter}`,
      role,
      passwordHash: await hashPassword(testPassword),
      createdAt: clockStart,
    },
  });
}

export function logIn(app: ReturnType<typeof createApp>, email: string, password = testPassword) {
  return request(app).post('/api/auth/login').send({ email, password });
}

// Returns the `sid=value` pair from a response, ready for a Cookie header.
export function sessionCookie(response: Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith('sid='))?.split(';')[0];
}

export function setCookieHeader(response: Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith('sid='));
}
