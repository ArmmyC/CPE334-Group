import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema, currentUserSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import {
  HOUR,
  MINUTE,
  allowedOrigin,
  clockStart,
  createAccount,
  createTestApp,
  fixedClock,
  logIn,
  sessionCookie,
  setCookieHeader,
  testPassword,
} from './helpers/app.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function me(app: ReturnType<typeof createTestApp>, cookie?: string) {
  const call = request(app).get('/api/auth/me');
  return cookie ? call.set('Cookie', cookie) : call;
}

describe('TEST-F01-01 login with correct credentials (AC-F01-01, FR-01)', () => {
  it('starts a session for a borrower and a custodian and returns their name and role', async () => {
    const app = createTestApp();
    const borrower = await createAccount('BORROWER');
    const custodian = await createAccount('CUSTODIAN');

    for (const [user, email] of [
      [borrower, borrower.email],
      [custodian, custodian.email.toUpperCase()],
    ] as const) {
      const response = await logIn(app, email);

      expect(response.status).toBe(200);
      expect(currentUserSchema.strict().parse(response.body)).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
      expect(sessionCookie(response)).toMatch(/^sid=[A-Za-z0-9_-]{43}$/);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    }
  });
});

describe('TEST-F01-02 generic refusal (AC-F01-02, FR-01)', () => {
  it('gives the same 401 for a wrong password and an unknown email, and creates no session', async () => {
    const app = createTestApp();
    const borrower = await createAccount();

    const wrongPassword = await logIn(app, borrower.email, 'wrong-password-1');
    const unknownEmail = await logIn(app, 'nobody@example.test', testPassword);

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.status).toBe(401);
      expect(apiErrorSchema.parse(response.body)).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
      });
      expect(sessionCookie(response)).toBeUndefined();
    }
    expect(await prisma.session.count()).toBe(0);
  });
});

describe('TEST-F01-03 logout (AC-F01-03, FR-02, NFR-04)', () => {
  it('deletes the session row, clears the cookie, and refuses the old cookie', async () => {
    const app = createTestApp();
    const borrower = await createAccount();
    const cookie = sessionCookie(await logIn(app, borrower.email))!;

    const response = await request(app).post('/api/auth/logout').set('Cookie', cookie);

    expect(response.status).toBe(204);
    expect(setCookieHeader(response)).toMatch(/^sid=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/);
    expect(await prisma.session.count()).toBe(0);
    const reused = await me(app, cookie);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses logout without a session', async () => {
    const response = await request(createTestApp()).post('/api/auth/logout');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('TEST-F01-04 current user (AC-F01-04, FR-03)', () => {
  it('returns exactly id, name, email, and role with a valid session', async () => {
    const app = createTestApp();
    const borrower = await createAccount();
    const cookie = sessionCookie(await logIn(app, borrower.email))!;

    const response = await me(app, cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: borrower.id,
      name: borrower.name,
      email: borrower.email,
      role: 'BORROWER',
    });
  });

  it.each([
    ['no cookie', undefined],
    ['an unknown token', 'sid=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['an empty token', 'sid='],
  ])('returns 401 with %s', async (_label, cookie) => {
    const response = await me(createTestApp(), cookie);

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(response.body)).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
    });
  });
});

describe('TEST-F01-05 password verification at login (AC-F01-05, NFR-01)', () => {
  it('logs in against the stored scrypt hash', async () => {
    const app = createTestApp();
    const borrower = await createAccount();

    expect(borrower.passwordHash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(borrower.passwordHash).not.toContain(testPassword);
    expect((await logIn(app, borrower.email)).status).toBe(200);
  });
});

describe('TEST-F01-06 idle and absolute expiry (AC-F01-06, NFR-04)', () => {
  it('accepts a session used just before 8 idle hours and moves last_used_at', async () => {
    const clock = fixedClock();
    const app = createTestApp({ clock });
    const borrower = await createAccount();
    const cookie = sessionCookie(await logIn(app, borrower.email))!;

    clock.advance(8 * HOUR - MINUTE);
    expect((await me(app, cookie)).status).toBe(200);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: borrower.id } });
    expect(session.lastUsedAt).toEqual(new Date(clockStart.getTime() + 8 * HOUR - MINUTE));
    expect(session.expiresAt).toEqual(new Date(clockStart.getTime() + 24 * HOUR));
  });

  it('refuses a session after exactly 8 hours without use and deletes it', async () => {
    const clock = fixedClock();
    const app = createTestApp({ clock });
    const borrower = await createAccount();
    const cookie = sessionCookie(await logIn(app, borrower.email))!;

    clock.advance(8 * HOUR);
    const response = await me(app, cookie);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(await prisma.session.count()).toBe(0);
  });

  it('refuses a session 24 hours after login even when it is used every 7 hours', async () => {
    const clock = fixedClock();
    const app = createTestApp({ clock });
    const borrower = await createAccount();
    const cookie = sessionCookie(await logIn(app, borrower.email))!;

    for (const hours of [7, 14, 21]) {
      clock.set(new Date(clockStart.getTime() + hours * HOUR));
      expect((await me(app, cookie)).status).toBe(200);
    }
    clock.set(new Date(clockStart.getTime() + 24 * HOUR - MINUTE));
    expect((await me(app, cookie)).status).toBe(200);

    clock.set(new Date(clockStart.getTime() + 24 * HOUR));
    expect((await me(app, cookie)).status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });
});

describe('TEST-F01-07 cookie flags and stored token hash (AC-F01-07, NFR-04)', () => {
  it('sets an httpOnly, SameSite=Lax cookie and stores only the SHA-256 of the token', async () => {
    const app = createTestApp();
    const borrower = await createAccount();

    const response = await logIn(app, borrower.email);
    const header = setCookieHeader(response)!;
    const token = sessionCookie(response)!.slice('sid='.length);

    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=86400');
    expect(header).not.toContain('Secure');
    const session = await prisma.session.findFirstOrThrow({ where: { userId: borrower.id } });
    expect(session.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(session.tokenHash).not.toBe(token);
  });

  it('adds Secure when the app runs with secure cookies (production)', async () => {
    const app = createTestApp({ secureCookies: true });
    const borrower = await createAccount();

    expect(setCookieHeader(await logIn(app, borrower.email))).toContain('Secure');
  });
});

describe('TEST-F01-08 Origin check on state-changing requests (AC-F01-08, NFR-04)', () => {
  it('refuses a login from another origin and creates no session', async () => {
    const app = createTestApp();
    const borrower = await createAccount();

    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: borrower.email, password: testPassword });

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('INVALID_ORIGIN');
    expect(sessionCookie(response)).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it('accepts the allowed origin and a request with no Origin header', async () => {
    const app = createTestApp();
    const borrower = await createAccount();

    const withOrigin = await request(app)
      .post('/api/auth/login')
      .set('Origin', allowedOrigin)
      .send({ email: borrower.email, password: testPassword });
    const withoutOrigin = await logIn(app, borrower.email);

    expect(withOrigin.status).toBe(200);
    expect(withoutOrigin.status).toBe(200);
  });

  it('refuses a logout from another origin and keeps the session', async () => {
    const app = createTestApp();
    const borrower = await createAccount();
    const cookie = sessionCookie(await logIn(app, borrower.email))!;

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INVALID_ORIGIN');
    expect(await prisma.session.count()).toBe(1);
  });
});

describe('Supporting check: expired sessions are cleaned at login', () => {
  it("deletes the user's expired sessions and keeps the valid ones", async () => {
    const clock = fixedClock();
    const app = createTestApp({ clock });
    const borrower = await createAccount();
    await logIn(app, borrower.email);

    clock.advance(9 * HOUR);
    await logIn(app, borrower.email);
    clock.advance(HOUR);
    await logIn(app, borrower.email);

    const sessions = await prisma.session.findMany({ where: { userId: borrower.id } });
    expect(sessions.map(({ createdAt }) => createdAt.getTime()).sort()).toEqual([
      clockStart.getTime() + 9 * HOUR,
      clockStart.getTime() + 10 * HOUR,
    ]);
  });
});
