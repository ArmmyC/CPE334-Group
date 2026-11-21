import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, logIn, sessionCookie } from './helpers/app.js';

// NG-F02: after Logout, browser Back showed cached signed-in pages. Neither the API
// responses nor the SPA shell may be stored by the browser (or its back/forward cache).
let clientDir: string;

beforeAll(() => {
  clientDir = mkdtempSync(join(tmpdir(), 'cpe334-cache-'));
  mkdirSync(join(clientDir, 'assets'));
  writeFileSync(join(clientDir, 'index.html'), '<!doctype html><title>spa</title>');
  writeFileSync(join(clientDir, 'assets', 'app-abc123.js'), 'console.log("app");');
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  rmSync(clientDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

function expectNoStore(headers: Record<string, string | undefined>) {
  expect(headers['cache-control']).toContain('no-store');
  expect(headers['pragma']).toBe('no-cache');
  expect(headers['expires']).toBe('0');
}

describe('NG-F02 no caching of signed-in content', () => {
  it('sends no-store on an authenticated API response', async () => {
    const app = createTestApp();
    const borrower = await createAccount('BORROWER');
    const cookie = sessionCookie(await logIn(app, borrower.email)) ?? '';

    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expectNoStore(response.headers);
  });

  it('sends no-store on a 401 API response', async () => {
    const response = await request(createTestApp()).get('/api/auth/me');

    expect(response.status).toBe(401);
    expectNoStore(response.headers);
  });

  it('sends no-store on the SPA shell for the root and a client route', async () => {
    const app = createTestApp({ clientDir });

    for (const path of ['/', '/my', '/catalog/4']) {
      const response = await request(app).get(path);

      expect(response.status).toBe(200);
      expectNoStore(response.headers);
    }
  });

  it('keeps hashed static assets cacheable', async () => {
    const response = await request(createTestApp({ clientDir })).get('/assets/app-abc123.js');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control'] ?? '').not.toContain('no-store');
  });
});
