import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, logIn, sessionCookie } from './helpers/app.js';
import { createCopy, createEquipmentType, createRequest } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type Account = Awaited<ReturnType<typeof createAccount>>;

async function signIn(app: ReturnType<typeof createTestApp>, account: Account) {
  const response = await logIn(app, account.email);
  return sessionCookie(response)!;
}

// A custodian assigned to Lab A, a borrower, and an equipment type in Lab A and in Lab B.
async function setUp(assign = true) {
  const app = createTestApp();
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  if (assign) {
    await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  }
  const typeA = await createEquipmentType(labA.id);
  const typeB = await createEquipmentType(labB.id);
  return { app, custodian, borrower, labA, labB, typeA, typeB };
}

// Loans are inserted directly, so these tests do not depend on the checkout path.
async function insertLoan(options: {
  typeId: number;
  borrowerId: number;
  checkedOutById: number;
  dueDate: string;
  checkedOutAt?: string;
  status?: 'ACTIVE' | 'RETURNED';
  assetTag?: string;
}) {
  const copy = await createCopy(options.typeId, options.assetTag);
  const borrowRequest = await createRequest(options.borrowerId, options.typeId, 'FULFILLED');
  return prisma.loan.create({
    data: {
      requestId: borrowRequest.id,
      copyId: copy.id,
      borrowerId: options.borrowerId,
      checkedOutById: options.checkedOutById,
      checkedOutAt: new Date(options.checkedOutAt ?? '2026-11-06T03:00:00.000Z'),
      dueDate: new Date(`${options.dueDate}T00:00:00.000Z`),
      status: options.status ?? 'ACTIVE',
    },
  });
}

function listLoans(app: ReturnType<typeof createTestApp>, cookie: string, query = '') {
  return request(app).get(`/api/custodian/loans${query}`).set('Cookie', cookie);
}

describe('TEST-F05-01 a custodian lists the active loans in assigned labs (AC-F05-01, FR-14)', () => {
  it('returns the Lab A active loans, earliest due date first, with the contract fields', async () => {
    const { app, custodian, borrower, labA, typeA, typeB } = await setUp();
    const later = await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-13',
      assetTag: 'A-LATER',
    });
    const earlier = await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-10',
      checkedOutAt: '2026-11-03T08:30:00.000Z',
      assetTag: 'A-EARLIER',
    });
    await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-09',
      status: 'RETURNED',
      assetTag: 'A-RETURNED',
    });
    await insertLoan({
      typeId: typeB.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-08',
      assetTag: 'B-OTHER-LAB',
    });
    const cookie = await signIn(app, custodian);

    const response = await listLoans(app, cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        {
          id: earlier.id,
          borrower: { id: borrower.id, name: borrower.name },
          equipmentType: { id: typeA.id, name: typeA.name },
          lab: { id: labA.id, name: 'Lab A' },
          assetTag: 'A-EARLIER',
          checkedOutAt: '2026-11-03T08:30:00.000Z',
          dueDate: '2026-11-10',
          status: 'ACTIVE',
        },
        {
          id: later.id,
          borrower: { id: borrower.id, name: borrower.name },
          equipmentType: { id: typeA.id, name: typeA.name },
          lab: { id: labA.id, name: 'Lab A' },
          assetTag: 'A-LATER',
          checkedOutAt: '2026-11-06T03:00:00.000Z',
          dueDate: '2026-11-13',
          status: 'ACTIVE',
        },
      ],
    });
  });
});

describe('TEST-F05-02 loans in unassigned labs and other roles (AC-F05-02, BR-15, NFR-03)', () => {
  it('leaves out a Lab B loan, answers a borrower with 403, and answers no session with 401', async () => {
    const { app, custodian, borrower, typeB } = await setUp();
    await insertLoan({
      typeId: typeB.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-10',
    });
    const custodianCookie = await signIn(app, custodian);
    const borrowerCookie = await signIn(app, borrower);

    const asCustodian = await listLoans(app, custodianCookie);
    const asBorrower = await listLoans(app, borrowerCookie);
    const noSession = await request(app).get('/api/custodian/loans');

    expect(asCustodian.status).toBe(200);
    expect(asCustodian.body).toEqual({ items: [] });
    expect(asBorrower.status).toBe(403);
    expect(asBorrower.body.error.code).toBe('FORBIDDEN');
    expect(noSession.status).toBe(401);
    expect(noSession.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('Supporting checks: F-05 list', () => {
  it('lists the active loans of two assigned labs in one list', async () => {
    const { app, custodian, borrower, labB, typeA, typeB } = await setUp();
    await prisma.labAssignment.create({ data: { labId: labB.id, custodianId: custodian.id } });
    await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-12',
      assetTag: 'A-1',
    });
    await insertLoan({
      typeId: typeB.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-11',
      assetTag: 'B-1',
    });
    const cookie = await signIn(app, custodian);

    const response = await listLoans(app, cookie);

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { assetTag: string }) => item.assetTag)).toEqual([
      'B-1',
      'A-1',
    ]);
  });

  it('returns an empty list, not an error, for a custodian with no assigned lab', async () => {
    const { app, custodian, borrower, typeA } = await setUp(false);
    await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-10',
    });
    const cookie = await signIn(app, custodian);

    const response = await listLoans(app, cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it('treats a missing status and status=ACTIVE alike and refuses any other value', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-10',
    });
    const cookie = await signIn(app, custodian);

    const omitted = await listLoans(app, cookie);
    const explicit = await listLoans(app, cookie, '?status=ACTIVE');
    const returned = await listLoans(app, cookie, '?status=RETURNED');
    const lowerCase = await listLoans(app, cookie, '?status=active');

    expect(omitted.status).toBe(200);
    expect(omitted.body.items).toHaveLength(1);
    expect(explicit.status).toBe(200);
    expect(explicit.body).toEqual(omitted.body);
    for (const refused of [returned, lowerCase]) {
      expect(refused.status).toBe(400);
      const { error } = apiErrorSchema.parse(refused.body);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.fields?.status).toBeTruthy();
    }
  });

  it('refuses an unknown query parameter with 400 (SDS 5.1)', async () => {
    const { app, custodian } = await setUp();
    const cookie = await signIn(app, custodian);

    const response = await listLoans(app, cookie, '?overdue=true');

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { overdue: 'Unknown parameter.' },
    });
  });

  it('orders loans with the same due date by checkout time, then by id', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const base = {
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-12',
    };
    const second = await insertLoan({
      ...base,
      checkedOutAt: '2026-11-05T09:00:00.000Z',
      assetTag: 'SECOND',
    });
    const first = await insertLoan({
      ...base,
      checkedOutAt: '2026-11-04T09:00:00.000Z',
      assetTag: 'FIRST',
    });
    const third = await insertLoan({
      ...base,
      checkedOutAt: '2026-11-05T09:00:00.000Z',
      assetTag: 'THIRD',
    });
    const cookie = await signIn(app, custodian);

    const response = await listLoans(app, cookie);

    expect(response.body.items.map((item: { id: number }) => item.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
  });
});
