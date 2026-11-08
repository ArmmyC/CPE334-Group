import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { createTestApp } from './helpers/app.js';

// Lab 5: the one image serves the built SPA and /api (SDS 10), so the server must serve
// client/dist itself and fall back to index.html for client-side routes.
let clientDir: string;

beforeAll(() => {
  clientDir = mkdtempSync(join(tmpdir(), 'cpe334-client-'));
  mkdirSync(join(clientDir, 'assets'));
  writeFileSync(join(clientDir, 'index.html'), '<!doctype html><title>spa</title>');
  writeFileSync(join(clientDir, 'assets', 'app.js'), 'console.log("app");');
});

afterAll(async () => {
  rmSync(clientDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('serving the built client', () => {
  it('serves index.html at the root', async () => {
    const response = await request(createTestApp({ clientDir })).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('<title>spa</title>');
  });

  it('serves a built asset as itself', async () => {
    const response = await request(createTestApp({ clientDir })).get('/assets/app.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
    expect(response.text).toContain('console.log');
  });

  it('falls back to index.html for a client-side route', async () => {
    const response = await request(createTestApp({ clientDir })).get('/catalog/4');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>spa</title>');
  });

  it('keeps API errors as JSON, never index.html', async () => {
    const response = await request(createTestApp({ clientDir })).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
  });

  it('answers 404 for a missing file instead of the SPA page', async () => {
    const response = await request(createTestApp({ clientDir })).get('/assets/missing.js');

    expect(response.status).toBe(404);
    expect(response.text).not.toContain('<title>spa</title>');
  });

  it('serves no SPA when no client directory is set', async () => {
    const response = await request(createTestApp()).get('/');

    expect(response.status).toBe(404);
  });

  it('still answers /api/health when the client is served', async () => {
    const response = await request(createTestApp({ clientDir })).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'ok' });
  });
});
