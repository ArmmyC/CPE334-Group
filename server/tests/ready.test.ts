import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { readyResponseSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { createTestApp } from './helpers/app.js';

afterAll(async () => {
  await prisma.$disconnect();
});

// Lab 5: the deploy workflow and Cloud Run use /api/ready to know the schema is in place.
describe('GET /api/ready', () => {
  it('is public and reports ready when every migration has been applied', async () => {
    const response = await request(createTestApp()).get('/api/ready');

    expect(response.status).toBe(200);
    expect(readyResponseSchema.parse(response.body)).toEqual({ status: 'ready' });
  });

  it('reports 503 when the readiness check fails', async () => {
    const app = createTestApp({
      checkReady: async () => {
        throw new Error('migration 20261106000000_sprint1_schema is not finished');
      },
    });

    const response = await request(app).get('/api/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not-ready' });
  });

  it('reports 503 when the readiness check does not finish in time', async () => {
    const app = createTestApp({
      checkReady: () => new Promise<void>(() => {}),
      healthTimeoutMs: 50,
    });

    const response = await request(app).get('/api/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not-ready' });
  });

  it('does not leak the failure reason', async () => {
    const app = createTestApp({
      checkReady: async () => {
        throw new Error('password authentication failed for user "secret-user"');
      },
    });

    const response = await request(app).get('/api/ready');

    expect(JSON.stringify(response.body)).not.toContain('secret-user');
  });
});
