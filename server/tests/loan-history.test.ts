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

type App = ReturnType<typeof createTestApp>;
type Account = Awaited<ReturnType<typeof createAccount>>;

const signIn = async (app: App, account: Account) =>
  sessionCookie(await logIn(app, account.email))!;

async function setUp() {
  const app = createTestApp();
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  const typeA = await createEquipmentType(labA.id);
  const typeB = await createEquipmentType(labB.id);
  const cookie = await signIn(app, custodian);
  return { app, custodian, borrower, labA, labB, typeA, typeB, cookie };
}

async function loan(
  copyId: number,
  borrowerId: number,
  custodianId: number,
  typeId: number,
  checkedOut: string,
  extra: { status?: 'ACTIVE' | 'RETURNED'; returnNote?: string; renewedAt?: Date } = {},
) {
  const fulfilled = await createRequest(borrowerId, typeId, 'FULFILLED');
  const returned = extra.status === 'RETURNED';
  return prisma.loan.create({
    data: {
      requestId: fulfilled.id,
      copyId,
      borrowerId,
      checkedOutById: custodianId,
      checkedOutAt: new Date(checkedOut),
      dueDate: new Date('2026-11-13T00:00:00.000Z'),
      status: extra.status ?? 'ACTIVE',
      returnedAt: returned ? new Date('2026-11-12T03:00:00.000Z') : null,
      returnedById: returned ? custodianId : null,
      returnNote: extra.returnNote ?? null,
      renewedAt: extra.renewedAt ?? null,
    },
  });
}

const copyHistory = (app: App, cookie: string, id: number | string, query = '') =>
  request(app).get(`/api/custodian/copies/${id}/loans${query}`).set('Cookie', cookie);
const borrowerHistory = (app: App, cookie: string, id: number | string, query = '') =>
  request(app).get(`/api/custodian/borrowers/${id}/loans${query}`).set('Cookie', cookie);

describe('TEST-F18-01 the loans of one copy (AC-F18-01, FR-20)', () => {
  it('lists them newest checkout first with return data', async () => {
    const { app, custodian, borrower, labA, typeA, cookie } = await setUp();
    const copy = await createCopy(typeA.id, 'H-1');
    const first = await loan(copy.id, borrower.id, custodian.id, typeA.id, '2026-11-01T03:00:00Z', {
      status: 'RETURNED',
      returnNote: 'Fine.',
    });
    const second = await loan(
      copy.id,
      borrower.id,
      custodian.id,
      typeA.id,
      '2026-11-05T03:00:00Z',
      {
        status: 'RETURNED',
        returnNote: 'Scratched.',
      },
    );
    const third = await loan(copy.id, borrower.id, custodian.id, typeA.id, '2026-11-09T03:00:00Z', {
      renewedAt: new Date('2026-11-10T03:00:00Z'),
    });

    const response = await copyHistory(app, cookie, copy.id);

    expect(response.status).toBe(200);
    expect(response.body.nextBeforeId).toBeNull();
    expect(response.body.items.map((i: { id: number }) => i.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
    expect(response.body.items[0]).toEqual({
      id: third.id,
      borrower: { id: borrower.id, name: borrower.name },
      assetTag: 'H-1',
      equipmentType: { id: typeA.id, name: typeA.name },
      lab: { id: labA.id, name: 'Lab A' },
      checkedOutAt: '2026-11-09T03:00:00.000Z',
      dueDate: '2026-11-13',
      status: 'ACTIVE',
      returnedAt: null,
      returnNote: null,
      renewed: true,
    });
    expect(response.body.items[1]).toMatchObject({
      status: 'RETURNED',
      returnedAt: '2026-11-12T03:00:00.000Z',
      returnNote: 'Scratched.',
      renewed: false,
    });
  });

  it('gives an empty list for a copy that was never lent', async () => {
    const { app, typeA, cookie } = await setUp();
    const copy = await createCopy(typeA.id, 'H-0');

    const response = await copyHistory(app, cookie, copy.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextBeforeId: null });
  });
});

describe('TEST-F18-02 the loans of one borrower (AC-F18-02, BR-15)', () => {
  it('lists only loans of copies in assigned labs', async () => {
    const { app, custodian, borrower, typeA, typeB, cookie } = await setUp();
    const mine = await createCopy(typeA.id, 'M-1');
    const theirs = await createCopy(typeB.id, 'T-1');
    const inA = await loan(mine.id, borrower.id, custodian.id, typeA.id, '2026-11-02T03:00:00Z');
    await loan(theirs.id, borrower.id, custodian.id, typeB.id, '2026-11-03T03:00:00Z');

    const response = await borrowerHistory(app, cookie, borrower.id);

    expect(response.status).toBe(200);
    expect(response.body.items.map((i: { id: number }) => i.id)).toEqual([inA.id]);
  });

  it('gives an empty list for a borrower with no loans in assigned labs', async () => {
    const { app, borrower, cookie } = await setUp();

    expect((await borrowerHistory(app, cookie, borrower.id)).body.items).toEqual([]);
    expect((await borrowerHistory(app, cookie, 99999)).body.items).toEqual([]);
  });
});

describe('TEST-F18-03 access and ids (AC-F18-03, NFR-03)', () => {
  it('gives 404 for another lab or a bad id, 403 to a borrower, 401 without a session', async () => {
    const { app, borrower, typeB, cookie } = await setUp();
    const foreign = await createCopy(typeB.id, 'F-1');
    const borrowerCookie = await signIn(app, borrower);

    expect((await copyHistory(app, cookie, foreign.id)).status).toBe(404);
    expect((await copyHistory(app, cookie, 99999)).status).toBe(404);
    expect((await copyHistory(app, cookie, 'abc')).status).toBe(404);
    expect((await borrowerHistory(app, cookie, 'abc')).status).toBe(404);
    expect((await copyHistory(app, borrowerCookie, foreign.id)).status).toBe(403);
    expect((await borrowerHistory(app, borrowerCookie, borrower.id)).status).toBe(403);
    expect((await request(app).get(`/api/custodian/copies/${foreign.id}/loans`)).status).toBe(401);
    expect((await request(app).get(`/api/custodian/borrowers/${borrower.id}/loans`)).status).toBe(
      401,
    );
  });
});

describe('TEST-F18-04 paging (AC-F18-04)', () => {
  it('pages 3, 3, 1 with equal checkout times, no gaps or repeats', async () => {
    const { app, custodian, borrower, typeA, cookie } = await setUp();
    const ids: number[] = [];
    for (const day of ['01', '02', '03', '03', '03', '04', '05']) {
      const copy = await createCopy(typeA.id, `P-${ids.length}`);
      const row = await loan(
        copy.id,
        borrower.id,
        custodian.id,
        typeA.id,
        `2026-11-${day}T03:00:00Z`,
        { status: 'RETURNED' },
      );
      ids.push(row.id);
    }

    const seen: number[] = [];
    const sizes: number[] = [];
    let beforeId: number | null = null;
    for (let page = 0; page < 5; page += 1) {
      const response = await borrowerHistory(
        app,
        cookie,
        borrower.id,
        `?limit=3${beforeId ? `&beforeId=${beforeId}` : ''}`,
      );
      expect(response.status).toBe(200);
      sizes.push(response.body.items.length);
      seen.push(...response.body.items.map((i: { id: number }) => i.id));
      beforeId = response.body.nextBeforeId;
      if (beforeId === null) break;
    }

    expect(sizes).toEqual([3, 3, 1]);
    expect(new Set(seen).size).toBe(7);
    // Newest checkout first; the three loans of the same day come in descending id order.
    expect(seen).toEqual([ids[6], ids[5], ids[4], ids[3], ids[2], ids[1], ids[0]]);
  });

  it('refuses bad limit, beforeId, and unknown parameters', async () => {
    const { app, typeA, cookie } = await setUp();
    const copy = await createCopy(typeA.id, 'Q-1');

    for (const query of [
      '?limit=0',
      '?limit=101',
      '?limit=x',
      '?beforeId=0',
      '?beforeId=x',
      '?x=1',
    ]) {
      const response = await copyHistory(app, cookie, copy.id, query);
      expect(response.status, query).toBe(400);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
    }
    expect((await copyHistory(app, cookie, copy.id, '?limit=100')).status).toBe(200);
  });
});
