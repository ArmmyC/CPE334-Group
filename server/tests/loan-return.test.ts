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

const returnTime = new Date('2026-11-10T05:00:00.000Z');

async function signIn(app: ReturnType<typeof createTestApp>, account: Account) {
  return sessionCookie(await logIn(app, account.email))!;
}

async function setUp() {
  const app = createTestApp({ clock: fixedClock(returnTime) });
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  const typeA = await createEquipmentType(labA.id);
  const typeB = await createEquipmentType(labB.id);
  return { app, custodian, borrower, typeA, typeB };
}

// An active loan with its copy On loan, inserted directly (checkout is F-04).
async function activeLoan(typeId: number, borrowerId: number, custodianId: number, tag: string) {
  const copy = await createCopy(typeId, tag);
  await prisma.copy.update({ where: { id: copy.id }, data: { status: 'ON_LOAN' } });
  const borrowRequest = await createRequest(borrowerId, typeId, 'FULFILLED');
  const loan = await prisma.loan.create({
    data: {
      requestId: borrowRequest.id,
      copyId: copy.id,
      borrowerId,
      checkedOutById: custodianId,
      checkedOutAt: new Date('2026-11-03T03:00:00.000Z'),
      dueDate: new Date('2026-11-12T00:00:00.000Z'),
      status: 'ACTIVE',
    },
  });
  return { loan, copy };
}

function returnLoan(
  app: ReturnType<typeof createTestApp>,
  cookie: string | undefined,
  id: number | string,
  body: object = { note: 'Fine.' },
) {
  const call = request(app).post(`/api/custodian/loans/${id}/return`);
  return (cookie ? call.set('Cookie', cookie) : call).send(body);
}

describe('TEST-F09-01 a custodian returns an active loan (AC-F09-01, FR-12, BR-08)', () => {
  it('marks the loan Returned with time, actor, and note, frees the copy, and frees the borrower slot', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const { loan, copy } = await activeLoan(typeA.id, borrower.id, custodian.id, 'A-1');
    const cookie = await signIn(app, custodian);

    const response = await returnLoan(app, cookie, loan.id, { note: '  Works fine.  ' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: loan.id,
      status: 'RETURNED',
      returnedAt: returnTime.toISOString(),
      copy: { id: copy.id, assetTag: 'A-1', status: 'AVAILABLE' },
    });
    const stored = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(stored).toMatchObject({
      status: 'RETURNED',
      returnedAt: returnTime,
      returnedById: custodian.id,
      returnNote: 'Works fine.',
    });
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'AVAILABLE',
    );
    // BR-04: the borrower has no active loan of this type any more.
    expect(
      await prisma.loan.count({
        where: { borrowerId: borrower.id, status: 'ACTIVE', copy: { equipmentTypeId: typeA.id } },
      }),
    ).toBe(0);
  });
});

describe('TEST-F09-02 a damaged copy goes to maintenance (AC-F09-02, FR-12, BR-08)', () => {
  it('sets the copy to IN_MAINTENANCE when damaged is true', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const { loan, copy } = await activeLoan(typeA.id, borrower.id, custodian.id, 'A-2');
    const cookie = await signIn(app, custodian);

    const response = await returnLoan(app, cookie, loan.id, { note: 'Cracked.', damaged: true });

    expect(response.status).toBe(200);
    expect(response.body.copy.status).toBe('IN_MAINTENANCE');
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'IN_MAINTENANCE',
    );
  });
});

describe('TEST-F09-03 a loan is returned once (AC-F09-03, BR-07)', () => {
  it('refuses the repeat with 409 and changes nothing', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const { loan } = await activeLoan(typeA.id, borrower.id, custodian.id, 'A-3');
    const cookie = await signIn(app, custodian);

    const first = await returnLoan(app, cookie, loan.id, { note: 'First.' });
    const second = await returnLoan(app, cookie, loan.id, { note: 'Second.', damaged: true });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(apiErrorSchema.parse(second.body).error.code).toBe('INVALID_STATUS');
    const stored = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(stored.returnNote).toBe('First.');
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: stored.copyId } })).status).toBe(
      'AVAILABLE',
    );
  });

  it('gives exactly one 200 and one history pair for 10 parallel returns', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const { loan } = await activeLoan(typeA.id, borrower.id, custodian.id, 'A-4');
    const cookie = await signIn(app, custodian);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => returnLoan(app, cookie, loan.id)),
    );

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(9);
    expect(
      await prisma.statusHistory.count({
        where: { entityType: 'LOAN', entityId: loan.id, newStatus: 'RETURNED' },
      }),
    ).toBe(1);
  });
});

describe('TEST-F09-04 scope and roles (AC-F09-04, BR-15, NFR-03)', () => {
  it('answers 404 for another lab and bad ids, 403 for a borrower, 401 without a session', async () => {
    const { app, custodian, borrower, typeB } = await setUp();
    const { loan } = await activeLoan(typeB.id, borrower.id, custodian.id, 'B-1');
    const custodianCookie = await signIn(app, custodian);
    const borrowerCookie = await signIn(app, borrower);

    const results = [
      await returnLoan(app, custodianCookie, loan.id),
      await returnLoan(app, borrowerCookie, loan.id),
      await returnLoan(app, undefined, loan.id),
      await returnLoan(app, custodianCookie, 'abc'),
      await returnLoan(app, custodianCookie, 99999),
    ];

    expect(results.map((r) => r.status)).toEqual([404, 403, 401, 404, 404]);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe('ACTIVE');
  });
});

describe('TEST-F09-05 note validation (AC-F09-05, FR-12)', () => {
  it('refuses a missing, blank, or 501-character note with fields.note', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const { loan } = await activeLoan(typeA.id, borrower.id, custodian.id, 'A-5');
    const cookie = await signIn(app, custodian);

    for (const body of [{}, { note: '   ' }, { note: 'x'.repeat(501) }]) {
      const response = await returnLoan(app, cookie, loan.id, body);
      expect(response.status).toBe(400);
      const error = apiErrorSchema.parse(response.body).error;
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.fields).toHaveProperty('note');
    }
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe('ACTIVE');
  });
});

describe('TEST-F09-06 history on return (AC-F09-06, FR-17)', () => {
  it('writes a LOAN row and a COPY row with the custodian, and none for a refused return', async () => {
    const { app, custodian, borrower, typeA, typeB } = await setUp();
    const { loan, copy } = await activeLoan(typeA.id, borrower.id, custodian.id, 'A-6');
    const other = await activeLoan(typeB.id, borrower.id, custodian.id, 'B-2');
    const cookie = await signIn(app, custodian);

    const ok = await returnLoan(app, cookie, loan.id);
    const refused = await returnLoan(app, cookie, other.loan.id);

    expect(ok.status).toBe(200);
    expect(refused.status).toBe(404);
    const rows = await prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });
    expect(
      rows.map((r) => [r.entityType, r.entityId, r.oldStatus, r.newStatus, r.actorId]),
    ).toEqual([
      ['LOAN', loan.id, 'ACTIVE', 'RETURNED', custodian.id],
      ['COPY', copy.id, 'ON_LOAN', 'AVAILABLE', custodian.id],
    ]);
  });
});
