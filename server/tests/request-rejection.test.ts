import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, fixedClock, logIn, sessionCookie } from './helpers/app.js';
import { createCopy, createEquipmentType, createRequest } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type Account = Awaited<ReturnType<typeof createAccount>>;

const decideTime = new Date('2026-11-10T05:00:00.000Z');

async function signIn(app: ReturnType<typeof createTestApp>, account: Account) {
  return sessionCookie(await logIn(app, account.email))!;
}

async function setUp() {
  const app = createTestApp({ clock: fixedClock(decideTime) });
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  const typeA = await createEquipmentType(labA.id);
  const typeB = await createEquipmentType(labB.id);
  await createCopy(typeA.id, 'A-COPY');
  return { app, custodian, borrower, typeA, typeB };
}

function reject(
  app: ReturnType<typeof createTestApp>,
  cookie: string | undefined,
  id: number | string,
  body: object = { reason: 'Not available this week.' },
) {
  const call = request(app).post(`/api/custodian/requests/${id}/reject`);
  return (cookie ? call.set('Cookie', cookie) : call).send(body);
}

describe('TEST-F08-01 a custodian rejects a Pending request (AC-F08-01, FR-11, BR-06)', () => {
  it('stores reason, time, and actor, and creates no loan', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const pending = await createRequest(borrower.id, typeA.id);
    const cookie = await signIn(app, custodian);

    const response = await reject(app, cookie, pending.id, { reason: '  Needed elsewhere.  ' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: pending.id,
      status: 'REJECTED',
      rejectionReason: 'Needed elsewhere.',
      decidedAt: decideTime.toISOString(),
    });
    const stored = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: pending.id } });
    expect(stored).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Needed elsewhere.',
      decidedAt: decideTime,
      decidedById: custodian.id,
    });
    expect(await prisma.loan.count()).toBe(0);
    expect(await prisma.copy.count({ where: { status: 'AVAILABLE' } })).toBe(1);
  });
});

describe('TEST-F08-02 reason validation (AC-F08-02, BR-13)', () => {
  it('refuses a missing, blank, or 501-character reason and accepts 500', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const bodies = [
      {},
      { reason: '   ' },
      { reason: 'x'.repeat(501) },
      { reason: 'x'.repeat(500) },
    ];
    const statuses: number[] = [];
    const ids: number[] = [];

    for (const body of bodies) {
      const other = await createAccount('BORROWER');
      const pending = await createRequest(other.id, typeA.id);
      ids.push(pending.id);
      const response = await reject(app, cookie, pending.id, body);
      statuses.push(response.status);
      if (response.status === 400) {
        const error = apiErrorSchema.parse(response.body).error;
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.fields).toHaveProperty('reason');
      }
    }

    expect(statuses).toEqual([400, 400, 400, 200]);
    const rows = await prisma.borrowRequest.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((row) => row.status)).toEqual(['PENDING', 'PENDING', 'PENDING', 'REJECTED']);
    expect(rows.slice(0, 3).every((row) => row.rejectionReason === null)).toBe(true);
    expect(borrower.id).toBeGreaterThan(0);
  });
});

describe('TEST-F08-03 only a Pending request can be rejected (AC-F08-03, BR-06)', () => {
  it('answers 409 INVALID_STATUS for Fulfilled, Cancelled, and already Rejected requests', async () => {
    const { app, custodian, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const created = [];
    for (const status of ['FULFILLED', 'CANCELLED', 'REJECTED'] as const) {
      const other = await createAccount('BORROWER');
      created.push(await createRequest(other.id, typeA.id, status));
    }

    for (const row of created) {
      const response = await reject(app, cookie, row.id);
      expect(response.status).toBe(409);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('INVALID_STATUS');
    }
    const rows = await prisma.borrowRequest.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => row.status)).toEqual(['FULFILLED', 'CANCELLED', 'REJECTED']);
    expect(rows.every((row) => row.rejectionReason === null)).toBe(true);
  });
});

describe('TEST-F08-04 scope and roles (AC-F08-04, BR-15, NFR-03)', () => {
  it('answers 404 for another lab and a bad id, 403 for a borrower, 401 without a session', async () => {
    const { app, custodian, borrower, typeB } = await setUp();
    const pending = await createRequest(borrower.id, typeB.id);
    const custodianCookie = await signIn(app, custodian);
    const borrowerCookie = await signIn(app, borrower);

    const results = [
      await reject(app, custodianCookie, pending.id),
      await reject(app, borrowerCookie, pending.id),
      await reject(app, undefined, pending.id),
      await reject(app, custodianCookie, 'abc'),
    ];

    expect(results.map((r) => r.status)).toEqual([404, 403, 401, 404]);
    expect(
      (await prisma.borrowRequest.findUniqueOrThrow({ where: { id: pending.id } })).status,
    ).toBe('PENDING');
  });
});

describe('TEST-F08-05 the borrower sees the reason and can request again (AC-F08-05, BR-04)', () => {
  it('lists rejectionReason and accepts a new request for the same type', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const pending = await createRequest(borrower.id, typeA.id);
    const custodianCookie = await signIn(app, custodian);
    await reject(app, custodianCookie, pending.id, { reason: 'Out for repair.' });
    const borrowerCookie = await signIn(app, borrower);

    const list = await request(app).get('/api/requests').set('Cookie', borrowerCookie);
    const again = await request(app)
      .post('/api/requests')
      .set('Cookie', borrowerCookie)
      .send({ equipmentTypeId: typeA.id });

    expect(list.status).toBe(200);
    expect(list.body[0]).toMatchObject({
      id: pending.id,
      status: 'REJECTED',
      rejectionReason: 'Out for repair.',
    });
    expect(again.status).toBe(201);
    expect(again.body.rejectionReason).toBeNull();
  });
});

describe('TEST-F08-06 history on rejection (AC-F08-06, FR-17)', () => {
  it('writes one REQUEST row PENDING to REJECTED with the actor, none for a refused call', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const pending = await createRequest(borrower.id, typeA.id);
    const cookie = await signIn(app, custodian);

    const first = await reject(app, cookie, pending.id);
    const second = await reject(app, cookie, pending.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    const rows = await prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });
    expect(
      rows.map((r) => [r.entityType, r.entityId, r.oldStatus, r.newStatus, r.actorId]),
    ).toEqual([['REQUEST', pending.id, 'PENDING', 'REJECTED', custodian.id]]);
  });
});
