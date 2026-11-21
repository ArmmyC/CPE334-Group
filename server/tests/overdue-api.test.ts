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

// 10 November 2026, 12:00 in Bangkok (05:00 UTC). A loan due 10 November is not overdue yet.
const noon = new Date('2026-11-10T05:00:00.000Z');

async function signIn(app: ReturnType<typeof createTestApp>, account: Account) {
  return sessionCookie(await logIn(app, account.email))!;
}

async function setUp() {
  const clock = fixedClock(noon);
  const app = createTestApp({ clock });
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  const typeA = await createEquipmentType(labA.id);
  const typeB = await createEquipmentType(labB.id);
  return { app, clock, custodian, borrower, typeA, typeB };
}

async function insertLoan(options: {
  typeId: number;
  borrowerId: number;
  checkedOutById: number;
  dueDate: string;
  assetTag: string;
  status?: 'ACTIVE' | 'RETURNED';
}) {
  const copy = await createCopy(options.typeId, options.assetTag);
  const borrowRequest = await createRequest(options.borrowerId, options.typeId, 'FULFILLED');
  return prisma.loan.create({
    data: {
      requestId: borrowRequest.id,
      copyId: copy.id,
      borrowerId: options.borrowerId,
      checkedOutById: options.checkedOutById,
      checkedOutAt: new Date('2026-11-03T03:00:00.000Z'),
      dueDate: new Date(`${options.dueDate}T00:00:00.000Z`),
      status: options.status ?? 'ACTIVE',
    },
  });
}

describe('TEST-F10-02 a borrower sees which loans are overdue (AC-F10-02, FR-13)', () => {
  it('marks the loan due 9 November overdue and the ones due 10 and 12 November not overdue', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    for (const [tag, dueDate] of [
      ['LATE', '2026-11-09'],
      ['TODAY', '2026-11-10'],
      ['LATER', '2026-11-12'],
    ]) {
      await insertLoan({
        typeId: typeA.id,
        borrowerId: borrower.id,
        checkedOutById: custodian.id,
        dueDate,
        assetTag: tag,
      });
    }
    const cookie = await signIn(app, borrower);

    const response = await request(app).get('/api/loans').set('Cookie', cookie);

    expect(response.status).toBe(200);
    const byTag = Object.fromEntries(
      response.body.map((loan: { assetTag: string; overdue: boolean }) => [
        loan.assetTag,
        loan.overdue,
      ]),
    );
    expect(byTag).toEqual({ LATE: true, TODAY: false, LATER: false });
  });
});

describe('TEST-F10-03 the custodian list carries overdue and filters on it (AC-F10-03, FR-14)', () => {
  it('marks overdue loans and returns only overdue loans with overdue=true', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-09',
      assetTag: 'LATE',
    });
    await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-12',
      assetTag: 'LATER',
    });
    const cookie = await signIn(app, custodian);

    const all = await request(app).get('/api/custodian/loans').set('Cookie', cookie);
    const onlyOverdue = await request(app)
      .get('/api/custodian/loans?overdue=true')
      .set('Cookie', cookie);

    expect(
      all.body.items.map((l: { assetTag: string; overdue: boolean }) => [l.assetTag, l.overdue]),
    ).toEqual([
      ['LATE', true],
      ['LATER', false],
    ]);
    expect(onlyOverdue.status).toBe(200);
    expect(onlyOverdue.body.items.map((l: { assetTag: string }) => l.assetTag)).toEqual(['LATE']);
  });

  it('moves a loan from not overdue to overdue when the Bangkok day changes', async () => {
    const { app, clock, custodian, borrower, typeA } = await setUp();
    await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-10',
      assetTag: 'EDGE',
    });
    const cookie = await signIn(app, custodian);

    // 23:59 Bangkok on the due date, then 00:00 on the next day.
    clock.set(new Date('2026-11-10T16:59:00.000Z'));
    const before = await request(app).get('/api/custodian/loans').set('Cookie', cookie);
    clock.set(new Date('2026-11-10T17:00:00.000Z'));
    const after = await request(app).get('/api/custodian/loans').set('Cookie', cookie);

    expect(before.body.items[0].overdue).toBe(false);
    expect(after.body.items[0].overdue).toBe(true);
  });
});

describe('TEST-F10-04 overdue=true stays inside assigned labs and roles (AC-F10-04, BR-15, NFR-03)', () => {
  it('leaves out an overdue Lab B loan and answers a borrower with 403', async () => {
    const { app, custodian, borrower, typeB } = await setUp();
    await insertLoan({
      typeId: typeB.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-01',
      assetTag: 'B-LATE',
    });
    const custodianCookie = await signIn(app, custodian);
    const borrowerCookie = await signIn(app, borrower);

    const asCustodian = await request(app)
      .get('/api/custodian/loans?overdue=true')
      .set('Cookie', custodianCookie);
    const asBorrower = await request(app)
      .get('/api/custodian/loans?overdue=true')
      .set('Cookie', borrowerCookie);

    expect(asCustodian.body.items).toEqual([]);
    expect(asBorrower.status).toBe(403);
  });
});

describe('TEST-F10-05 a returned loan is not overdue and nothing is stored (AC-F10-05, BR-09)', () => {
  it('lists a returned loan with overdue false and keeps no overdue column in the loan table', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    await insertLoan({
      typeId: typeA.id,
      borrowerId: borrower.id,
      checkedOutById: custodian.id,
      dueDate: '2026-11-01',
      assetTag: 'RETURNED',
      status: 'RETURNED',
    });
    const cookie = await signIn(app, borrower);

    const response = await request(app).get('/api/loans').set('Cookie', cookie);
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'loan'`;

    expect(response.body[0]).toMatchObject({ assetTag: 'RETURNED', overdue: false });
    expect(columns.map((column) => column.column_name)).not.toContain('overdue');
  });
});

describe('TEST-F10-06 query validation (AC-F10-06, SR-02)', () => {
  it('refuses overdue=false, overdue=1, and an unknown parameter with 400', async () => {
    const { app, custodian } = await setUp();
    const cookie = await signIn(app, custodian);

    for (const query of ['?overdue=false', '?overdue=1', '?foo=1']) {
      const response = await request(app).get(`/api/custodian/loans${query}`).set('Cookie', cookie);
      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
    }
  });
});
