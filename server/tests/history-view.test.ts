import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, fixedClock, logIn, sessionCookie } from './helpers/app.js';
import { createCopy, createEquipmentType, createLoan, createRequest } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type App = ReturnType<typeof createTestApp>;

const t0 = new Date('2026-11-10T05:00:00.000Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

async function setUp() {
  const clock = fixedClock(t0);
  const app = createTestApp({ clock });
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  const typeA = await createEquipmentType(labA.id);
  const typeB = await createEquipmentType(labB.id);
  const cookie = sessionCookie(await logIn(app, custodian.email))!;
  return { clock, app, custodian, borrower, labA, labB, typeA, typeB, cookie };
}

const get = (app: App, cookie: string, query = '') =>
  request(app).get(`/api/custodian/history${query}`).set('Cookie', cookie);

function entry(data: {
  entityType: 'REQUEST' | 'LOAN' | 'COPY';
  entityId: number;
  labId: number;
  oldStatus: string | null;
  newStatus: string;
  actorId: number;
  createdAt: Date;
}) {
  return prisma.statusHistory.create({ data });
}

describe('TEST-F14-01 the list with its fields and subjects (AC-F14-01, AC-F14-05, FR-17)', () => {
  it('returns request, loan, and copy entries newest first with the subject text', async () => {
    const { app, custodian, borrower, labA, typeA, cookie } = await setUp();
    const copy = await createCopy(typeA.id, 'TAG-1');
    const fulfilled = await createRequest(borrower.id, typeA.id, 'FULFILLED');
    const loan = await createLoan(fulfilled.id, copy.id, borrower.id, custodian.id);
    const base = { labId: labA.id, actorId: custodian.id };
    const created = await entry({
      ...base,
      entityType: 'COPY',
      entityId: copy.id,
      oldStatus: null,
      newStatus: 'AVAILABLE',
      createdAt: at(0),
    });
    const requestEntry = await entry({
      ...base,
      entityType: 'REQUEST',
      entityId: fulfilled.id,
      oldStatus: 'PENDING',
      newStatus: 'FULFILLED',
      createdAt: at(5),
    });
    const loanEntry = await entry({
      ...base,
      entityType: 'LOAN',
      entityId: loan.id,
      oldStatus: null,
      newStatus: 'ACTIVE',
      createdAt: at(10),
    });

    const response = await get(app, cookie);

    expect(response.status).toBe(200);
    expect(response.body.nextBeforeId).toBeNull();
    expect(response.body.items).toEqual([
      {
        id: loanEntry.id,
        entityType: 'LOAN',
        entityId: loan.id,
        subject: `Loan #${loan.id}: TAG-1 to ${borrower.name}`,
        oldStatus: null,
        newStatus: 'ACTIVE',
        createdAt: at(10).toISOString(),
        actor: { id: custodian.id, name: custodian.name },
        lab: { id: labA.id, name: 'Lab A' },
      },
      {
        id: requestEntry.id,
        entityType: 'REQUEST',
        entityId: fulfilled.id,
        subject: `Request #${fulfilled.id}: ${typeA.name} for ${borrower.name}`,
        oldStatus: 'PENDING',
        newStatus: 'FULFILLED',
        createdAt: at(5).toISOString(),
        actor: { id: custodian.id, name: custodian.name },
        lab: { id: labA.id, name: 'Lab A' },
      },
      {
        id: created.id,
        entityType: 'COPY',
        entityId: copy.id,
        subject: `TAG-1 (${typeA.name})`,
        oldStatus: null,
        newStatus: 'AVAILABLE',
        createdAt: at(0).toISOString(),
        actor: { id: custodian.id, name: custodian.name },
        lab: { id: labA.id, name: 'Lab A' },
      },
    ]);
  });
});

describe('TEST-F14-02 only assigned labs (AC-F14-02, BR-15)', () => {
  it('never returns an entry of another lab, with or without a filter', async () => {
    const { app, custodian, labA, labB, typeA, typeB, cookie } = await setUp();
    const mine = await createCopy(typeA.id, 'A-1');
    const theirs = await createCopy(typeB.id, 'B-1');
    await entry({
      entityType: 'COPY',
      entityId: mine.id,
      labId: labA.id,
      oldStatus: null,
      newStatus: 'AVAILABLE',
      actorId: custodian.id,
      createdAt: at(0),
    });
    await entry({
      entityType: 'COPY',
      entityId: theirs.id,
      labId: labB.id,
      oldStatus: null,
      newStatus: 'AVAILABLE',
      actorId: custodian.id,
      createdAt: at(1),
    });

    for (const query of ['', '?entityType=COPY']) {
      const response = await get(app, cookie, query);
      expect(response.status).toBe(200);
      expect(response.body.items.map((i: { entityId: number }) => i.entityId)).toEqual([mine.id]);
    }
  });
});

describe('TEST-F14-03 the type filter (AC-F14-03)', () => {
  it('filters by entity type and refuses an unknown value', async () => {
    const { app, custodian, borrower, labA, typeA, cookie } = await setUp();
    const copy = await createCopy(typeA.id, 'F-1');
    const fulfilled = await createRequest(borrower.id, typeA.id, 'FULFILLED');
    const loan = await createLoan(fulfilled.id, copy.id, borrower.id, custodian.id);
    const base = { labId: labA.id, actorId: custodian.id, oldStatus: null, newStatus: 'X' };
    await entry({ ...base, entityType: 'COPY', entityId: copy.id, createdAt: at(0) });
    await entry({ ...base, entityType: 'REQUEST', entityId: fulfilled.id, createdAt: at(1) });
    await entry({ ...base, entityType: 'LOAN', entityId: loan.id, createdAt: at(2) });

    for (const type of ['COPY', 'LOAN', 'REQUEST']) {
      const response = await get(app, cookie, `?entityType=${type}`);
      expect(response.status).toBe(200);
      expect(response.body.items.map((i: { entityType: string }) => i.entityType)).toEqual([type]);
    }
    const bad = await get(app, cookie, '?entityType=BOGUS');
    expect(bad.status).toBe(400);
    expect(apiErrorSchema.parse(bad.body).error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(bad.body.error.fields)).toContain('entityType');
  });
});

describe('TEST-F14-04 paging (AC-F14-04)', () => {
  it('pages 3, 3, 1 without gaps or repeats, including entries with the same time', async () => {
    const { app, custodian, labA, typeA, cookie } = await setUp();
    const copy = await createCopy(typeA.id, 'P-1');
    const ids: number[] = [];
    for (const minutes of [0, 1, 2, 2, 2, 3, 4]) {
      const row = await entry({
        entityType: 'COPY',
        entityId: copy.id,
        labId: labA.id,
        oldStatus: null,
        newStatus: 'AVAILABLE',
        actorId: custodian.id,
        createdAt: at(minutes),
      });
      ids.push(row.id);
    }
    const expected = [...ids].sort((a, b) => {
      const byTime =
        [0, 1, 2, 2, 2, 3, 4][ids.indexOf(b)]! - [0, 1, 2, 2, 2, 3, 4][ids.indexOf(a)]!;
      return byTime || b - a;
    });

    const seen: number[] = [];
    const sizes: number[] = [];
    let beforeId: number | null = null;
    for (let page = 0; page < 5; page += 1) {
      const response = await get(app, cookie, `?limit=3${beforeId ? `&beforeId=${beforeId}` : ''}`);
      expect(response.status).toBe(200);
      sizes.push(response.body.items.length);
      seen.push(...response.body.items.map((i: { id: number }) => i.id));
      beforeId = response.body.nextBeforeId;
      if (beforeId === null) break;
    }

    expect(sizes).toEqual([3, 3, 1]);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(7);
  });

  it('refuses bad limit, beforeId, and unknown parameters', async () => {
    const { app, cookie } = await setUp();

    for (const query of [
      '?limit=0',
      '?limit=101',
      '?limit=x',
      '?limit=2.5',
      '?beforeId=x',
      '?beforeId=0',
      '?labId=1',
    ]) {
      const response = await get(app, cookie, query);
      expect(response.status, query).toBe(400);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
    }
    expect((await get(app, cookie, '?limit=100')).status).toBe(200);
    expect((await get(app, cookie, '?limit=1')).status).toBe(200);
  });
});

describe('TEST-F14-05 access (AC-F14-06, SR-01)', () => {
  it('gives a borrower 403 and no session 401', async () => {
    const { app, borrower } = await setUp();
    const borrowerCookie = sessionCookie(await logIn(app, borrower.email))!;

    expect((await get(app, borrowerCookie)).status).toBe(403);
    expect((await request(app).get('/api/custodian/history')).status).toBe(401);
  });
});

describe('TEST-F14-06 a real flow shows up in order (AC-F14-01)', () => {
  it('lists the entries of a request, checkout, and return with the custodian as actor', async () => {
    const { app, clock, custodian, borrower, typeA, cookie } = await setUp();
    const copy = await createCopy(typeA.id, 'FLOW-1');
    const borrowerCookie = sessionCookie(await logIn(app, borrower.email))!;

    const submitted = await request(app)
      .post('/api/requests')
      .set('Cookie', borrowerCookie)
      .send({ equipmentTypeId: typeA.id });
    clock.advance(60_000);
    const checkedOut = await request(app)
      .post(`/api/custodian/requests/${submitted.body.id}/checkout`)
      .set('Cookie', cookie)
      .send({ copyId: copy.id });
    clock.advance(60_000);
    const returned = await request(app)
      .post(`/api/custodian/loans/${checkedOut.body.id}/return`)
      .set('Cookie', cookie)
      .send({ note: 'Fine.' });

    const response = await get(app, cookie);

    expect(submitted.status).toBe(201);
    expect(returned.status).toBe(200);
    const changes = response.body.items.map(
      (i: {
        entityType: string;
        oldStatus: string | null;
        newStatus: string;
        actor: { id: number };
      }) => [i.entityType, i.oldStatus, i.newStatus, i.actor.id] as const,
    );
    expect(changes).toEqual([
      ['COPY', 'ON_LOAN', 'AVAILABLE', custodian.id],
      ['LOAN', 'ACTIVE', 'RETURNED', custodian.id],
      ['COPY', 'AVAILABLE', 'ON_LOAN', custodian.id],
      ['LOAN', null, 'ACTIVE', custodian.id],
      ['REQUEST', 'PENDING', 'FULFILLED', custodian.id],
      ['REQUEST', null, 'PENDING', borrower.id],
    ]);
  });
});
