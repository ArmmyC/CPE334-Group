import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { createTestApp } from './helpers/app.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('TEST-SR02-01 every API error uses the shared shape (AC-SR02-01, NFR-07)', () => {
  const app = createTestApp();

  it('returns 400 VALIDATION_ERROR with a message for each missing login field', async () => {
    const response = await request(app).post('/api/auth/login').send({});

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body)).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Check the highlighted fields.',
        fields: { email: 'Enter your email address.', password: 'Enter your password.' },
      },
    });
  });

  it('returns a field message for an invalid email address', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.error.fields).toEqual({ email: 'Enter a valid email address.' });
  });

  it('treats a request with no JSON body like an empty body', async () => {
    const response = await request(app).post('/api/auth/login');

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.error.fields).sort()).toEqual(['email', 'password']);
  });

  it('returns 400 INVALID_JSON for a malformed body', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('INVALID_JSON');
  });

  it('returns 413 PAYLOAD_TOO_LARGE for a body over 100kb', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@example.test', password: 'x'.repeat(110 * 1024) });

    expect(response.status).toBe(413);
    expect(apiErrorSchema.parse(response.body)).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' },
    });
  });

  it('returns 404 NOT_FOUND for an unknown API route', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
  });

  it('returns 500 INTERNAL_ERROR without internal details when a handler fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = {
      user: {
        findUnique: () => Promise.reject(new Error('SELECT password_hash FROM "user" failed')),
      },
    } as unknown as PrismaClient;

    const response = await request(createTestApp({ prisma: failing }))
      .post('/api/auth/login')
      .send({ email: 'a@example.test', password: 'some-password' });

    expect(response.status).toBe(500);
    expect(apiErrorSchema.strict().parse(response.body)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/SELECT|password_hash|at /);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
