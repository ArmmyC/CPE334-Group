import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, logIn, sessionCookie, testPassword } from './helpers/app.js';
import {
  createCopy,
  createEquipmentType,
  createLab,
  createLoan,
  createRequest,
  createUser,
} from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Logs in a fresh account with the real password hash and returns its session cookie.
async function signIn(app: ReturnType<typeof createTestApp>, role: 'BORROWER' | 'CUSTODIAN') {
  const account = await createAccount(role);
  const cookie = sessionCookie(await logIn(app, account.email, testPassword))!;
  return { account, cookie };
}

function submit(
  app: ReturnType<typeof createTestApp>,
  cookie: string | undefined,
  body: Record<string, unknown>,
) {
  const call = request(app).post('/api/requests');
  return (cookie ? call.set('Cookie', cookie) : call).send(body);
}

function cancel(app: ReturnType<typeof createTestApp>, cookie: string | undefined, id: number) {
  const call = request(app).post(`/api/requests/${id}/cancel`);
  return cookie ? call.set('Cookie', cookie) : call;
}

function list(app: ReturnType<typeof createTestApp>, cookie: string | undefined, path: string) {
  const call = request(app).get(path);
  return cookie ? call.set('Cookie', cookie) : call;
}

describe('TEST-F03-01 submit a borrow request (AC-F03-01, FR-06)', () => {
  it('stores a Pending request with the purpose, and with a null purpose when none is given', async () => {
    const app = createTestApp();
    const { account, cookie } = await signIn(app, 'BORROWER');
    const type = await createEquipmentType();
    await createCopy(type.id);

    const withPurpose = await submit(app, cookie, {
      equipmentTypeId: type.id,
      purpose: 'Lab practical',
    });
    const withoutPurpose = await submit(app, cookie, { equipmentTypeId: type.id });

    expect(withPurpose.status).toBe(201);
    expect(withPurpose.body).toMatchObject({ status: 'PENDING', purpose: 'Lab practical' });
    expect(withoutPurpose.status).toBe(201);
    expect(withoutPurpose.body).toMatchObject({ status: 'PENDING', purpose: null });
    const stored = await prisma.borrowRequest.findMany({
      where: { borrowerId: account.id },
      orderBy: { id: 'asc' },
    });
    expect(stored.map(({ purpose, status }) => ({ purpose, status }))).toEqual([
      { purpose: 'Lab practical', status: 'PENDING' },
      { purpose: null, status: 'PENDING' },
    ]);
  });
});

describe('TEST-F03-02 refuse a type with no Available copy (AC-F03-02, BR-03)', () => {
  it('returns 409 NO_AVAILABLE_COPY, stores nothing, and leaves the copies unchanged', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'BORROWER');
    const type = await createEquipmentType();
    const onLoan = await createCopy(type.id);
    const inMaintenance = await createCopy(type.id);
    await prisma.copy.update({ where: { id: onLoan.id }, data: { status: 'ON_LOAN' } });
    await prisma.copy.update({
      where: { id: inMaintenance.id },
      data: { status: 'IN_MAINTENANCE' },
    });

    const response = await submit(app, cookie, { equipmentTypeId: type.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('NO_AVAILABLE_COPY');
    expect(await prisma.borrowRequest.count()).toBe(0);
    const copies = await prisma.copy.findMany({ where: { equipmentTypeId: type.id } });
    expect(copies.map(({ status }) => status).sort()).toEqual(['IN_MAINTENANCE', 'ON_LOAN']);
  });
});

describe('TEST-F03-03 one Pending request or active loan per type (AC-F03-03, BR-04)', () => {
  it('refuses a second request while the first is Pending, and while a loan of the type is active', async () => {
    const app = createTestApp();
    const { account: pendingBorrower, cookie: pendingCookie } = await signIn(app, 'BORROWER');
    const { account: loanBorrower, cookie: loanCookie } = await signIn(app, 'BORROWER');
    const custodian = await createUser('CUSTODIAN');
    const firstType = await createEquipmentType();
    await createCopy(firstType.id);
    const secondType = await createEquipmentType();
    const loanedCopy = await createCopy(secondType.id);
    await prisma.copy.update({ where: { id: loanedCopy.id }, data: { status: 'ON_LOAN' } });
    await createCopy(secondType.id);
    const loanRequest = await createRequest(loanBorrower.id, secondType.id, 'FULFILLED');
    await createLoan(loanRequest.id, loanedCopy.id, loanBorrower.id, custodian.id);

    expect((await submit(app, pendingCookie, { equipmentTypeId: firstType.id })).status).toBe(201);
    const duplicatePending = await submit(app, pendingCookie, {
      equipmentTypeId: firstType.id,
    });
    const duplicateLoan = await submit(app, loanCookie, { equipmentTypeId: secondType.id });

    expect(duplicatePending.status).toBe(409);
    expect(duplicatePending.body.error.code).toBe('DUPLICATE_REQUEST');
    expect(duplicateLoan.status).toBe(409);
    expect(duplicateLoan.body.error.code).toBe('DUPLICATE_REQUEST');
    expect(await prisma.borrowRequest.count({ where: { borrowerId: pendingBorrower.id } })).toBe(1);
  });

  it('gives one 201 and one 409 DUPLICATE_REQUEST for two parallel requests, and stores one Pending', async () => {
    const app = createTestApp();
    const { account, cookie } = await signIn(app, 'BORROWER');
    const type = await createEquipmentType();
    await createCopy(type.id);
    await createCopy(type.id);

    const [first, second] = await Promise.all([
      submit(app, cookie, { equipmentTypeId: type.id }),
      submit(app, cookie, { equipmentTypeId: type.id }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const refused = first.status === 409 ? first : second;
    expect(refused.body.error.code).toBe('DUPLICATE_REQUEST');
    const pending = await prisma.borrowRequest.count({
      where: { borrowerId: account.id, equipmentTypeId: type.id, status: 'PENDING' },
    });
    expect(pending).toBe(1);
  });
});

describe('TEST-F03-04 borrower sees own requests and loans (AC-F03-04, FR-07, BR-16)', () => {
  it('lists only the caller requests, newest first, and only the caller loans', async () => {
    const app = createTestApp();
    const { account: borrower, cookie } = await signIn(app, 'BORROWER');
    const other = await createUser('BORROWER');
    const custodian = await createUser('CUSTODIAN');
    const lab = await createLab();
    const pendingType = await createEquipmentType(lab.id);
    const cancelledType = await createEquipmentType(lab.id);
    const loanType = await createEquipmentType(lab.id);

    const older = await prisma.borrowRequest.create({
      data: {
        borrowerId: borrower.id,
        equipmentTypeId: cancelledType.id,
        purpose: 'Older',
        status: 'CANCELLED',
        createdAt: new Date('2026-11-05T03:00:00.000Z'),
      },
    });
    const newer = await prisma.borrowRequest.create({
      data: {
        borrowerId: borrower.id,
        equipmentTypeId: pendingType.id,
        status: 'PENDING',
        createdAt: new Date('2026-11-06T03:00:00.000Z'),
      },
    });
    await createRequest(other.id, pendingType.id);
    const loanRequest = await prisma.borrowRequest.create({
      data: {
        borrowerId: borrower.id,
        equipmentTypeId: loanType.id,
        status: 'FULFILLED',
        createdAt: new Date('2026-11-06T04:00:00.000Z'),
      },
    });
    const loanCopy = await createCopy(loanType.id, 'LOAN-0001');
    await createLoan(loanRequest.id, loanCopy.id, borrower.id, custodian.id);
    const otherRequest = await createRequest(other.id, loanType.id, 'FULFILLED');
    const otherCopy = await createCopy(loanType.id, 'LOAN-0002');
    await createLoan(otherRequest.id, otherCopy.id, other.id, custodian.id);

    const requests = await list(app, cookie, '/api/requests');
    const loans = await list(app, cookie, '/api/loans');

    expect(requests.status).toBe(200);
    expect(requests.body.map((item: { id: number }) => item.id)).toEqual([
      loanRequest.id,
      newer.id,
      older.id,
    ]);
    expect(requests.body[2]).toMatchObject({
      status: 'CANCELLED',
      purpose: 'Older',
      equipmentType: { id: cancelledType.id },
      lab: { name: lab.name },
    });
    expect(requests.body[2].createdAt).toBeDefined();
    expect(requests.body[2].decidedAt).toBeNull();
    expect(loans.status).toBe(200);
    expect(loans.body).toHaveLength(1);
    expect(loans.body[0]).toMatchObject({
      assetTag: 'LOAN-0001',
      dueDate: '2026-11-13',
      status: 'ACTIVE',
      equipmentType: { id: loanType.id },
    });
  });
});

describe('TEST-F03-05 another borrower record is not found (AC-F03-05, BR-16, NFR-03)', () => {
  it('returns 404 when cancelling another borrower request, and leaves that request unchanged', async () => {
    const app = createTestApp();
    const { account: borrower, cookie } = await signIn(app, 'BORROWER');
    const other = await createUser('BORROWER');
    const type = await createEquipmentType();
    const otherRequest = await createRequest(other.id, type.id);
    const ownRequest = await createRequest(borrower.id, type.id);

    // Control: the caller can cancel their own request, so a 404 below is not a missing route.
    expect((await cancel(app, cookie, ownRequest.id)).status).toBe(200);
    const response = await cancel(app, cookie, otherRequest.id);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    const unchanged = await prisma.borrowRequest.findUniqueOrThrow({
      where: { id: otherRequest.id },
    });
    expect(unchanged.status).toBe('PENDING');
  });
});

describe('TEST-F03-06 borrower cancels own Pending request (AC-F03-06, FR-10, BR-06)', () => {
  it('cancels the request, and a new request for the same type is then accepted', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'BORROWER');
    const type = await createEquipmentType();
    await createCopy(type.id);
    const created = await submit(app, cookie, { equipmentTypeId: type.id });

    const cancelled = await cancel(app, cookie, created.body.id);
    const again = await submit(app, cookie, { equipmentTypeId: type.id });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ id: created.body.id, status: 'CANCELLED' });
    expect(again.status).toBe(201);
    expect(again.body.status).toBe('PENDING');
  });
});

describe('TEST-F03-07 cancel only a Pending request (AC-F03-07, BR-06)', () => {
  it('refuses to cancel a Cancelled or Fulfilled request, and keeps its status', async () => {
    const app = createTestApp();
    const { account, cookie } = await signIn(app, 'BORROWER');
    const type = await createEquipmentType();
    const cancelledRequest = await createRequest(account.id, type.id, 'CANCELLED');
    const fulfilledRequest = await createRequest(account.id, type.id, 'FULFILLED');

    const cancelledAgain = await cancel(app, cookie, cancelledRequest.id);
    const fulfilledCancel = await cancel(app, cookie, fulfilledRequest.id);

    expect(cancelledAgain.status).toBe(409);
    expect(cancelledAgain.body.error.code).toBe('INVALID_STATUS');
    expect(fulfilledCancel.status).toBe(409);
    expect(fulfilledCancel.body.error.code).toBe('INVALID_STATUS');
    const statuses = await prisma.borrowRequest.findMany({
      where: { id: { in: [cancelledRequest.id, fulfilledRequest.id] } },
      orderBy: { id: 'asc' },
    });
    expect(statuses.map(({ status }) => status)).toEqual(['CANCELLED', 'FULFILLED']);
  });
});

describe('TEST-F03-08 a request does not reserve a copy (AC-F03-08, BR-17)', () => {
  it('keeps the Available count of the type at 2 after a request is submitted', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'BORROWER');
    const type = await createEquipmentType();
    await createCopy(type.id);
    await createCopy(type.id);

    const response = await submit(app, cookie, { equipmentTypeId: type.id });

    expect(response.status).toBe(201);
    const available = await prisma.copy.count({
      where: { equipmentTypeId: type.id, status: 'AVAILABLE' },
    });
    expect(available).toBe(2);
  });
});

describe('TEST-F03-09 custodians get 403 on borrower routes (AC-F03-09, NFR-03)', () => {
  it('refuses a custodian on submit, cancel, and both lists, and creates nothing', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'CUSTODIAN');
    const borrower = await createUser('BORROWER');
    const type = await createEquipmentType();
    await createCopy(type.id);
    const pending = await createRequest(borrower.id, type.id);

    const responses = [
      await submit(app, cookie, { equipmentTypeId: type.id }),
      await cancel(app, cookie, pending.id),
      await list(app, cookie, '/api/requests'),
      await list(app, cookie, '/api/loans'),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect(await prisma.borrowRequest.count()).toBe(1);
    const unchanged = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: pending.id } });
    expect(unchanged.status).toBe('PENDING');
  });

  it('returns 401 on every borrower route without a session', async () => {
    const app = createTestApp();

    const responses = [
      await submit(app, undefined, { equipmentTypeId: 1 }),
      await cancel(app, undefined, 1),
      await list(app, undefined, '/api/requests'),
      await list(app, undefined, '/api/loans'),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    }
  });
});

describe('Supporting checks for borrow requests (SDS 5.3, SR-02)', () => {
  it('returns 400 with field messages for a missing type id and an over-long purpose', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'BORROWER');
    const type = await createEquipmentType();

    const missingType = await submit(app, cookie, { purpose: 'No type' });
    const longPurpose = await submit(app, cookie, {
      equipmentTypeId: type.id,
      purpose: 'x'.repeat(501),
    });

    expect(missingType.status).toBe(400);
    expect(missingType.body.error.code).toBe('VALIDATION_ERROR');
    expect(missingType.body.error.fields).toHaveProperty('equipmentTypeId');
    expect(longPurpose.status).toBe(400);
    expect(longPurpose.body.error.fields).toHaveProperty('purpose');
    expect(await prisma.borrowRequest.count()).toBe(0);
  });

  it('returns 404 for an equipment type that does not exist', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'BORROWER');

    const type = await createEquipmentType();
    await createCopy(type.id);
    // Control: a real type is accepted, so a 404 below is not a missing route.
    expect((await submit(app, cookie, { equipmentTypeId: type.id })).status).toBe(201);

    const response = await submit(app, cookie, { equipmentTypeId: 987654 });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await prisma.borrowRequest.count({ where: { equipmentTypeId: 987654 } })).toBe(0);
  });

  it('stores a purpose of spaces only as null', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'BORROWER');
    const type = await createEquipmentType();
    await createCopy(type.id);

    const response = await submit(app, cookie, { equipmentTypeId: type.id, purpose: '   ' });

    expect(response.status).toBe(201);
    expect(response.body.purpose).toBeNull();
  });
});
