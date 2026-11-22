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

type App = ReturnType<typeof createTestApp>;
type Account = Awaited<ReturnType<typeof createAccount>>;

// 2026-11-10 12:00 in Asia/Bangkok.
const now = new Date('2026-11-10T05:00:00.000Z');

const signIn = async (app: App, account: Account) => sessionCookie(await logIn(app, account.email))!;

async function setUp(clockTime = now) {
  const clock = fixedClock(clockTime);
  const app = createTestApp({ clock });
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  const typeA = await createEquipmentType(labA.id);
  const typeB = await createEquipmentType(labB.id);
  await prisma.equipmentType.update({ where: { id: typeA.id }, data: { loanPeriodDays: 7 } });
  return { app, custodian, borrower, typeA, typeB };
}

async function activeLoan(
  typeId: number,
  borrowerId: number,
  custodianId: number,
  tag: string,
  dueDate = '2026-11-13',
  status: 'ACTIVE' | 'RETURNED' = 'ACTIVE',
) {
  const copy = await createCopy(typeId, tag);
  await prisma.copy.update({
    where: { id: copy.id },
    data: { status: status === 'ACTIVE' ? 'ON_LOAN' : 'AVAILABLE' },
  });
  const borrowRequest = await createRequest(borrowerId, typeId, 'FULFILLED');
  const loan = await prisma.loan.create({
    data: {
      requestId: borrowRequest.id,
      copyId: copy.id,
      borrowerId,
      checkedOutById: custodianId,
      checkedOutAt: new Date('2026-11-03T03:00:00.000Z'),
      dueDate: new Date(`${dueDate}T00:00:00.000Z`),
      status,
    },
  });
  return { loan, copy };
}

function renew(app: App, cookie: string | undefined, id: number | string) {
  const call = request(app).post(`/api/custodian/loans/${id}/renew`);
  return cookie ? call.set('Cookie', cookie) : call;
}

describe('TEST-F16-01 a custodian renews an active loan (AC-F16-01, FR-18, BR-14)', () => {
  it('moves the due date by the loan period and keeps the loan Active', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const { loan, copy } = await activeLoan(typeA.id, borrower.id, custodian.id, 'A-1');
    const cookie = await signIn(app, custodian);

    const response = await renew(app, cookie, loan.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: loan.id,
      dueDate: '2026-11-20',
      renewedAt: now.toISOString(),
    });
    const stored = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(stored.status).toBe('ACTIVE');
    expect(stored.dueDate.toISOString().slice(0, 10)).toBe('2026-11-20');
    expect(stored.renewedAt?.toISOString()).toBe(now.toISOString());
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'ON_LOAN',
    );
  });
});

describe('TEST-F16-02 a loan is renewed once (AC-F16-02, BR-14)', () => {
  it('refuses a repeat and lets exactly one of ten parallel renewals win', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const first = await activeLoan(typeA.id, borrower.id, custodian.id, 'A-1');
    const second = await activeLoan(typeA.id, borrower.id, custodian.id, 'A-2');
    const cookie = await signIn(app, custodian);

    expect((await renew(app, cookie, first.loan.id)).status).toBe(200);
    const repeat = await renew(app, cookie, first.loan.id);
    expect(repeat.status).toBe(409);
    expect(apiErrorSchema.parse(repeat.body).error.code).toBe('ALREADY_RENEWED');
    expect(
      (await prisma.loan.findUniqueOrThrow({ where: { id: first.loan.id } })).dueDate
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-11-20');

    const results = await Promise.all(
      Array.from({ length: 10 }, () => renew(app, cookie, second.loan.id)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect(
      await prisma.statusHistory.count({
        where: { entityType: 'LOAN', entityId: second.loan.id },
      }),
    ).toBe(1);
  });
});

describe('TEST-F16-03 overdue loans are not renewed (AC-F16-03, BR-09, BR-14)', () => {
  it('renews on the due date and refuses the day after, in Asia/Bangkok', async () => {
    const onDue = await setUp(new Date('2026-11-13T05:00:00.000Z'));
    const dueToday = await activeLoan(onDue.typeA.id, onDue.borrower.id, onDue.custodian.id, 'D-1');
    const yesterday = await activeLoan(
      onDue.typeA.id,
      onDue.borrower.id,
      onDue.custodian.id,
      'D-2',
      '2026-11-12',
    );
    const cookie = await signIn(onDue.app, onDue.custodian);

    expect((await renew(onDue.app, cookie, dueToday.loan.id)).status).toBe(200);
    const late = await renew(onDue.app, cookie, yesterday.loan.id);
    expect(late.status).toBe(409);
    expect(apiErrorSchema.parse(late.body).error.code).toBe('LOAN_OVERDUE');
    const stored = await prisma.loan.findUniqueOrThrow({ where: { id: yesterday.loan.id } });
    expect(stored.renewedAt).toBeNull();
    expect(stored.dueDate.toISOString().slice(0, 10)).toBe('2026-11-12');
  });

  it('counts 17:30 UTC on the due date as already the next day in Bangkok', async () => {
    const { app, custodian, borrower, typeA } = await setUp(new Date('2026-11-13T17:30:00.000Z'));
    const { loan } = await activeLoan(typeA.id, borrower.id, custodian.id, 'D-3');
    const cookie = await signIn(app, custodian);

    const response = await renew(app, cookie, loan.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LOAN_OVERDUE');
  });
});

describe('TEST-F16-04 a returned loan is not renewed (AC-F16-04)', () => {
  it('gives 409 INVALID_STATUS', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const { loan } = await activeLoan(
      typeA.id,
      borrower.id,
      custodian.id,
      'R-1',
      '2026-11-13',
      'RETURNED',
    );
    const cookie = await signIn(app, custodian);

    const response = await renew(app, cookie, loan.id);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('INVALID_STATUS');
  });
});

describe('TEST-F16-05 access and scope (AC-F16-05, BR-15, NFR-03)', () => {
  it('gives 404 for another lab and bad ids, 403 for a borrower, 401 with no session', async () => {
    const { app, custodian, borrower, typeB } = await setUp();
    const { loan } = await activeLoan(typeB.id, borrower.id, custodian.id, 'B-1');
    const custodianCookie = await signIn(app, custodian);
    const borrowerCookie = await signIn(app, borrower);

    expect((await renew(app, custodianCookie, loan.id)).status).toBe(404);
    expect((await renew(app, borrowerCookie, loan.id)).status).toBe(403);
    expect((await renew(app, undefined, loan.id)).status).toBe(401);
    expect((await renew(app, custodianCookie, 'abc')).status).toBe(404);
    expect((await renew(app, custodianCookie, 99999)).status).toBe(404);
    const stored = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(stored.renewedAt).toBeNull();
    expect(stored.dueDate.toISOString().slice(0, 10)).toBe('2026-11-13');
  });
});

describe('TEST-F16-06 history (AC-F16-06, FR-17)', () => {
  it('writes one loan row with the custodian as actor, and none for a refused renewal', async () => {
    const { app, custodian, borrower, typeA, typeB } = await setUp();
    const mine = await activeLoan(typeA.id, borrower.id, custodian.id, 'H-1');
    const other = await activeLoan(typeB.id, borrower.id, custodian.id, 'H-2');
    const cookie = await signIn(app, custodian);

    await renew(app, cookie, mine.loan.id);
    await renew(app, cookie, mine.loan.id);
    await renew(app, cookie, other.loan.id);

    const rows = await prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityType: 'LOAN',
      entityId: mine.loan.id,
      oldStatus: 'ACTIVE',
      newStatus: 'ACTIVE',
      actorId: custodian.id,
    });
  });
});

describe('F-16 the active loan list shows the renewed flag (AC-F16-07)', () => {
  it('returns renewed true after a renewal and false before', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const a = await activeLoan(typeA.id, borrower.id, custodian.id, 'L-1');
    await activeLoan(typeA.id, borrower.id, custodian.id, 'L-2');
    const cookie = await signIn(app, custodian);
    await renew(app, cookie, a.loan.id);

    const list = await request(app).get('/api/custodian/loans').set('Cookie', cookie);

    const flags = Object.fromEntries(
      list.body.items.map((i: { assetTag: string; renewed: boolean }) => [i.assetTag, i.renewed]),
    );
    expect(flags).toEqual({ 'L-1': true, 'L-2': false });
  });
});
