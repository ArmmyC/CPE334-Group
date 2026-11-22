import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, logIn, sessionCookie } from './helpers/app.js';
import { createCopy, createRequest } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// The test clock starts at 2026-11-07T02:00:00Z, which is 2026-11-07 09:00 in Asia/Bangkok.
const TODAY = '2026-11-07';

type App = ReturnType<typeof createTestApp>;
type Account = Awaited<ReturnType<typeof createAccount>>;

const signIn = async (app: App, account: Account) =>
  sessionCookie(await logIn(app, account.email))!;

const summary = (app: App, cookie: string, query = '') =>
  request(app).get(`/api/custodian/summary${query}`).set('Cookie', cookie);

async function setUp() {
  const app = createTestApp();
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  const labC = await prisma.lab.create({ data: { name: 'Lab C' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  await prisma.labAssignment.create({ data: { labId: labC.id, custodianId: custodian.id } });
  const cookie = await signIn(app, custodian);
  return { app, custodian, borrower, labA, labB, labC, cookie };
}

const typeIn = (labId: number, name: string) =>
  prisma.equipmentType.create({
    data: { labId, name, category: 'Boards', description: 'Fixture' },
  });

async function copyWith(
  typeId: number,
  status: 'AVAILABLE' | 'ON_LOAN' | 'IN_MAINTENANCE' | 'RETIRED',
) {
  const copy = await createCopy(typeId);
  return prisma.copy.update({ where: { id: copy.id }, data: { status } });
}

async function loan(
  typeId: number,
  borrowerId: number,
  custodianId: number,
  checkedOut: string,
  extra: { dueDate?: string; status?: 'ACTIVE' | 'RETURNED' } = {},
) {
  const copy = await createCopy(typeId);
  const fulfilled = await createRequest(borrowerId, typeId, 'FULFILLED');
  const returned = extra.status === 'RETURNED';
  return prisma.loan.create({
    data: {
      requestId: fulfilled.id,
      copyId: copy.id,
      borrowerId,
      checkedOutById: custodianId,
      checkedOutAt: new Date(checkedOut),
      dueDate: new Date(`${extra.dueDate ?? '2026-11-20'}T00:00:00.000Z`),
      status: extra.status ?? 'ACTIVE',
      returnedAt: returned ? new Date('2026-11-06T03:00:00.000Z') : null,
      returnedById: returned ? custodianId : null,
    },
  });
}

describe('TEST-F19-01 copies by status per assigned lab (AC-F19-01, FR-21)', () => {
  it('counts each status, with zero for none, and orders labs by name', async () => {
    const { app, labA, labC, cookie } = await setUp();
    const a1 = await typeIn(labA.id, 'A1');
    const a2 = await typeIn(labA.id, 'A2');
    await copyWith(a1.id, 'AVAILABLE');
    await copyWith(a1.id, 'AVAILABLE');
    await copyWith(a2.id, 'ON_LOAN');
    await copyWith(a2.id, 'RETIRED');

    const response = await summary(app, cookie);

    expect(response.status).toBe(200);
    expect(response.body.labs.map((l: { lab: { name: string } }) => l.lab.name)).toEqual([
      'Lab A',
      'Lab C',
    ]);
    expect(response.body.labs[0]).toEqual({
      lab: { id: labA.id, name: 'Lab A' },
      copies: { AVAILABLE: 2, ON_LOAN: 1, IN_MAINTENANCE: 0, RETIRED: 1 },
      activeLoans: 0,
      overdueLoans: 0,
      topTypes: [],
    });
    expect(response.body.labs[1].lab.id).toBe(labC.id);
    expect(response.body.labs[1].copies).toEqual({
      AVAILABLE: 0,
      ON_LOAN: 0,
      IN_MAINTENANCE: 0,
      RETIRED: 0,
    });
  });
});

describe('TEST-F19-02 active and overdue loans (AC-F19-02, BR-09)', () => {
  it('treats the due date itself as not overdue and ignores returned loans', async () => {
    const { app, custodian, borrower, labA, cookie } = await setUp();
    const type = await typeIn(labA.id, 'Scope');
    const when = '2026-11-03T03:00:00Z';
    await loan(type.id, borrower.id, custodian.id, when, { dueDate: '2026-11-06' });
    await loan(type.id, borrower.id, custodian.id, when, { dueDate: '2026-11-07' });
    await loan(type.id, borrower.id, custodian.id, when, { dueDate: '2026-11-08' });
    await loan(type.id, borrower.id, custodian.id, when, {
      dueDate: '2026-11-01',
      status: 'RETURNED',
    });

    const response = await summary(app, cookie);

    expect(response.body.labs[0].activeLoans).toBe(3);
    expect(response.body.labs[0].overdueLoans).toBe(1);
  });
});

describe('TEST-F19-03 top equipment types by checkouts (AC-F19-03, FR-21)', () => {
  it('keeps the top 5 by checkouts then name, counting returned loans', async () => {
    const { app, custodian, borrower, labA, cookie } = await setUp();
    const counts: [string, number][] = [
      ['Bravo', 3],
      ['Alpha', 2],
      ['Delta', 2],
      ['Charlie', 1],
      ['Echo', 1],
      ['Foxtrot', 1],
      ['Golf', 1],
    ];
    for (const [name, count] of counts) {
      const type = await typeIn(labA.id, name);
      for (let i = 0; i < count; i += 1) {
        await loan(type.id, borrower.id, custodian.id, '2026-11-03T03:00:00Z', {
          status: name === 'Bravo' && i === 0 ? 'RETURNED' : 'ACTIVE',
        });
      }
    }

    const response = await summary(app, cookie);

    expect(
      response.body.labs[0].topTypes.map(
        (t: { equipmentType: { name: string }; checkouts: number }) => [
          t.equipmentType.name,
          t.checkouts,
        ],
      ),
    ).toEqual([
      ['Bravo', 3],
      ['Alpha', 2],
      ['Delta', 2],
      ['Charlie', 1],
      ['Echo', 1],
    ]);
    expect(response.body.labs[0].topTypes[0].equipmentType.id).toBeTypeOf('number');
  });

  it('counts a checkout by its Bangkok date, inclusive at both ends', async () => {
    const { app, custodian, borrower, labA, cookie } = await setUp();
    const type = await typeIn(labA.id, 'Zulu');
    // 2026-11-01 23:59 Bangkok, outside.
    await loan(type.id, borrower.id, custodian.id, '2026-11-01T16:59:00Z');
    // 2026-11-02 00:30 Bangkok, inside (it is 17:30 UTC on the 1st).
    await loan(type.id, borrower.id, custodian.id, '2026-11-01T17:30:00Z');
    // 2026-11-02 23:59 Bangkok, inside.
    await loan(type.id, borrower.id, custodian.id, '2026-11-02T16:59:00Z');
    // 2026-11-03 00:00 Bangkok, outside.
    await loan(type.id, borrower.id, custodian.id, '2026-11-02T17:00:00Z');

    const response = await summary(app, cookie, '?from=2026-11-02&to=2026-11-02');

    expect(response.status).toBe(200);
    expect(response.body.range).toEqual({ from: '2026-11-02', to: '2026-11-02' });
    expect(response.body.labs[0].topTypes).toEqual([
      { equipmentType: { id: type.id, name: 'Zulu' }, checkouts: 2 },
    ]);
  });

  it('defaults to the last 30 days ending today in Bangkok', async () => {
    const { app, cookie } = await setUp();

    const response = await summary(app, cookie);
    expect(response.body.range).toEqual({ from: '2026-10-09', to: TODAY });

    const onlyTo = await summary(app, cookie, '?to=2026-11-03');
    expect(onlyTo.body.range).toEqual({ from: '2026-10-05', to: '2026-11-03' });
  });
});

describe('TEST-F19-04 scope and access (AC-F19-04, BR-15, NFR-03)', () => {
  it('never shows other labs, and gives 403 to a borrower and 401 without a session', async () => {
    const { app, custodian, borrower, labB, cookie } = await setUp();
    const type = await typeIn(labB.id, 'Hidden');
    await copyWith(type.id, 'AVAILABLE');
    await loan(type.id, borrower.id, custodian.id, '2026-11-03T03:00:00Z');
    const borrowerCookie = await signIn(app, borrower);

    const response = await summary(app, cookie);

    expect(JSON.stringify(response.body)).not.toContain('Lab B');
    expect(JSON.stringify(response.body)).not.toContain('Hidden');
    expect((await summary(app, borrowerCookie)).status).toBe(403);
    expect((await request(app).get('/api/custodian/summary')).status).toBe(401);
  });

  it('gives an empty list to a custodian with no assignment', async () => {
    const { app } = await setUp();
    const lonely = await createAccount('CUSTODIAN');

    const response = await summary(app, await signIn(app, lonely));

    expect(response.status).toBe(200);
    expect(response.body.labs).toEqual([]);
  });
});

describe('TEST-F19-05 range validation (AC-F19-05, SR-02)', () => {
  it('refuses bad dates, a reversed range, and more than 366 days', async () => {
    const { app, cookie } = await setUp();

    for (const query of [
      '?from=abc',
      '?from=2026-13-01',
      '?to=2026-02-30',
      '?from=2026-11-05&to=2026-11-04',
      '?from=2025-11-05&to=2026-11-07',
      '?from=2026-11-01&from=2026-11-02',
      '?x=1',
    ]) {
      const response = await summary(app, cookie, query);
      expect(response.status, query).toBe(400);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
    }
    // 366 days apart is the longest allowed range.
    expect((await summary(app, cookie, '?from=2025-11-06&to=2026-11-07')).status).toBe(200);
  });
});
