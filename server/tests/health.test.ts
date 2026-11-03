import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from '@cpe334-group/shared';
import { createApp } from '../src/app.js';
import { checkDatabase, prisma } from '../src/db.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/health', () => {
  it('reports ok when the test database is reachable', async () => {
    const response = await request(createApp({ checkDatabase })).get('/api/health');

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({ status: 'ok', database: 'ok' });
  });

  it('reports 503 when the database check fails', async () => {
    const app = createApp({
      checkDatabase: async () => {
        throw new Error('connection refused');
      },
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', database: 'unreachable' });
  });
});

describe('API error handling', () => {
  const app = createApp({ checkDatabase });

  it('returns the shared error shape for an unknown API route', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('INVALID_JSON');
  });

  it('sets security headers', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
