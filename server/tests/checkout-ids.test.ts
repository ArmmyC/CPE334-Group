import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, logIn, sessionCookie, testPassword } from './helpers/app.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// A 32-bit integer column cannot hold this value. It must not reach the database as a query
// parameter, or the API answers 500 instead of the 404 and 400 the SDS gives (SDS 5.1).
const beyondInt32 = 99_999_999_999;

describe('Supporting check: ids beyond the 32-bit range (SDS 5.1)', () => {
  it('gives 404 for such a request id and 400 for such a copy id', async () => {
    const app = createTestApp();
    const custodian = await createAccount('CUSTODIAN');
    const cookie = sessionCookie(await logIn(app, custodian.email, testPassword))!;

    const available = await request(app)
      .get(`/api/custodian/requests/${beyondInt32}/available-copies`)
      .set('Cookie', cookie);
    expect(available.status).toBe(404);
    expect(available.body.error.code).toBe('NOT_FOUND');

    const unknownRequest = await request(app)
      .post(`/api/custodian/requests/${beyondInt32}/checkout`)
      .set('Cookie', cookie)
      .send({ copyId: 1 });
    expect(unknownRequest.status).toBe(404);
    expect(unknownRequest.body.error.code).toBe('NOT_FOUND');

    const hugeCopy = await request(app)
      .post('/api/custodian/requests/1/checkout')
      .set('Cookie', cookie)
      .send({ copyId: beyondInt32 });
    expect(hugeCopy.status).toBe(400);
    expect(hugeCopy.body.error.code).toBe('VALIDATION_ERROR');
    expect(hugeCopy.body.error.fields.copyId).toBeDefined();
  });
});
