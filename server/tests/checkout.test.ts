import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import {
  createAccount,
  createTestApp,
  fixedClock,
  logIn,
  sessionCookie,
  testPassword,
} from './helpers/app.js';
import {
  createCopy,
  createEquipmentType,
  createLab,
  createUser,
  fixtureTime,
} from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type App = ReturnType<typeof createTestApp>;

// Logs in a fresh account with the real password hash and returns its session cookie.
async function signIn(app: App, role: 'BORROWER' | 'CUSTODIAN', labIds: number[] = []) {
  const account = await createAccount(role);
  for (const labId of labIds) {
    await prisma.labAssignment.create({ data: { labId, custodianId: account.id } });
  }
  const cookie = sessionCookie(await logIn(app, account.email, testPassword))!;
  return { account, cookie };
}

function get(app: App, cookie: string | undefined, path: string) {
  const call = request(app).get(path);
  return cookie ? call.set('Cookie', cookie) : call;
}

function checkout(app: App, cookie: string | undefined, requestId: number | string, body: object) {
  const call = request(app).post(`/api/custodian/requests/${requestId}/checkout`);
  return (cookie ? call.set('Cookie', cookie) : call).send(body);
}

type RequestOptions = {
  createdAt?: Date;
  status?: 'PENDING' | 'FULFILLED' | 'CANCELLED';
  borrowerId?: number;
};

// A request is inserted directly, because the request form is F-03 and F-02.
async function pendingRequest(typeId: number, options: RequestOptions = {}) {
  const borrowerId = options.borrowerId ?? (await createUser('BORROWER')).id;
  return prisma.borrowRequest.create({
    data: {
      borrowerId,
      equipmentTypeId: typeId,
      status: options.status ?? 'PENDING',
      createdAt: options.createdAt ?? fixtureTime,
    },
  });
}

// One lab with one type, as most tests need.
async function setUpLab() {
  const lab = await createLab();
  const type = await createEquipmentType(lab.id);
  return { lab, type };
}

async function snapshot() {
  return {
    requests: await prisma.borrowRequest.findMany({ orderBy: { id: 'asc' } }),
    copies: await prisma.copy.findMany({ orderBy: { id: 'asc' } }),
    loans: await prisma.loan.count(),
    history: await prisma.statusHistory.count(),
  };
}

describe('TEST-F04-01 pending requests in assigned labs (AC-F04-01, FR-08, BR-15)', () => {
  it('lists only Pending requests of assigned labs, oldest first, with the fields in the contract', async () => {
    const app = createTestApp();
    const a = await setUpLab();
    const b = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [a.lab.id]);
    const newest = await pendingRequest(a.type.id, { createdAt: new Date('2026-11-06T09:00:00Z') });
    const oldest = await pendingRequest(a.type.id, { createdAt: new Date('2026-11-06T03:00:00Z') });
    const middle = await pendingRequest(a.type.id, { createdAt: new Date('2026-11-06T05:00:00Z') });
    await pendingRequest(a.type.id, { status: 'FULFILLED' });
    await pendingRequest(b.type.id);

    const response = await get(app, cookie, '/api/custodian/requests?status=PENDING');

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: number }) => item.id)).toEqual([
      oldest.id,
      middle.id,
      newest.id,
    ]);
    const borrower = await prisma.user.findUniqueOrThrow({ where: { id: oldest.borrowerId } });
    expect(response.body.items[0]).toEqual({
      id: oldest.id,
      borrower: { id: borrower.id, name: borrower.name },
      equipmentType: { id: a.type.id, name: a.type.name },
      lab: { id: a.lab.id, name: a.lab.name },
      purpose: null,
      createdAt: '2026-11-06T03:00:00.000Z',
    });
  });

  it('orders requests with the same time by id, and sees the labs of two assignments', async () => {
    const app = createTestApp();
    const a = await setUpLab();
    const b = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [a.lab.id, b.lab.id]);
    const first = await pendingRequest(a.type.id);
    const second = await pendingRequest(b.type.id);

    const response = await get(app, cookie, '/api/custodian/requests');

    expect(response.body.items.map((item: { id: number }) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('returns an empty list for a custodian with no assigned lab', async () => {
    const app = createTestApp();
    const a = await setUpLab();
    await pendingRequest(a.type.id);
    const { cookie } = await signIn(app, 'CUSTODIAN');

    const response = await get(app, cookie, '/api/custodian/requests');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it('refuses another status or an unknown parameter with 400', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'CUSTODIAN');

    const other = await get(app, cookie, '/api/custodian/requests?status=FULFILLED');
    const unknown = await get(app, cookie, '/api/custodian/requests?overdue=true');

    expect(other.status).toBe(400);
    expect(apiErrorSchema.parse(other.body).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { status: expect.any(String) },
    });
    expect(unknown.status).toBe(400);
    expect(apiErrorSchema.parse(unknown.body).error.code).toBe('VALIDATION_ERROR');
    expect(unknown.body.error.fields).toEqual({ overdue: 'Unknown parameter.' });
  });
});

describe('available copies of a request (FR-09, BR-15)', () => {
  it('returns only Available copies of the request type, sorted by asset tag', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const otherType = await createEquipmentType(lab.id);
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    const second = await createCopy(type.id, 'B-2');
    const first = await createCopy(type.id, 'A-1');
    const onLoan = await createCopy(type.id, 'C-3');
    await prisma.copy.update({ where: { id: onLoan.id }, data: { status: 'ON_LOAN' } });
    await createCopy(otherType.id, 'D-4');

    const response = await get(app, cookie, `/api/custodian/requests/${req.id}/available-copies`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        { id: first.id, assetTag: 'A-1' },
        { id: second.id, assetTag: 'B-2' },
      ],
    });
  });
});

describe('TEST-F04-02 checkout creates the loan (AC-F04-02, FR-09, BR-08)', () => {
  it('creates an active loan, marks the copy On loan and the request Fulfilled, and writes three history entries', async () => {
    const clock = fixedClock(new Date('2026-11-08T03:00:00.000Z'));
    const app = createTestApp({ clock });
    const { lab, type } = await setUpLab();
    const { account, cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    const chosen = await createCopy(type.id, 'OSC-1');
    const other = await createCopy(type.id, 'OSC-2');

    const response = await checkout(app, cookie, req.id, { copyId: chosen.id });

    expect(response.status).toBe(201);
    const loan = await prisma.loan.findUniqueOrThrow({ where: { requestId: req.id } });
    const borrower = await prisma.user.findUniqueOrThrow({ where: { id: req.borrowerId } });
    expect(response.body).toEqual({
      id: loan.id,
      requestId: req.id,
      borrower: { id: borrower.id, name: borrower.name },
      equipmentType: { id: type.id, name: type.name },
      lab: { id: lab.id, name: lab.name },
      assetTag: 'OSC-1',
      checkedOutAt: '2026-11-08T03:00:00.000Z',
      dueDate: '2026-11-15',
      status: 'ACTIVE',
    });
    expect(loan).toMatchObject({
      copyId: chosen.id,
      borrowerId: req.borrowerId,
      checkedOutById: account.id,
      status: 'ACTIVE',
    });
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: chosen.id } })).status).toBe(
      'ON_LOAN',
    );
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: other.id } })).status).toBe(
      'AVAILABLE',
    );
    const stored = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(stored).toMatchObject({ status: 'FULFILLED', decidedById: account.id });
    expect(stored.decidedAt?.toISOString()).toBe('2026-11-08T03:00:00.000Z');

    const history = await prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });
    const entry = (
      entityType: string,
      entityId: number,
      oldStatus: string | null,
      newStatus: string,
    ) => ({
      entityType,
      entityId,
      labId: lab.id,
      oldStatus,
      newStatus,
      actorId: account.id,
      createdAt: '2026-11-08T03:00:00.000Z',
    });
    expect(
      history.map(({ createdAt, id: _id, ...rest }) => ({
        ...rest,
        createdAt: createdAt.toISOString(),
      })),
    ).toEqual([
      entry('REQUEST', req.id, 'PENDING', 'FULFILLED'),
      entry('COPY', chosen.id, 'AVAILABLE', 'ON_LOAN'),
      entry('LOAN', loan.id, null, 'ACTIVE'),
    ]);
  });

  it('uses the loan period of the type', async () => {
    const app = createTestApp({ clock: fixedClock(new Date('2026-11-08T03:00:00.000Z')) });
    const { lab, type } = await setUpLab();
    await prisma.equipmentType.update({ where: { id: type.id }, data: { loanPeriodDays: 30 } });
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    const copy = await createCopy(type.id);

    const response = await checkout(app, cookie, req.id, { copyId: copy.id });

    expect(response.body.dueDate).toBe('2026-12-08');
  });
});

describe('TEST-F04-03 due date at the Bangkok day boundary through checkout (AC-F04-03, BR-05, NFR-08)', () => {
  it.each([
    ['23:59 Bangkok', '2026-11-08T16:59:00.000Z', '2026-11-15'],
    ['00:00 Bangkok', '2026-11-08T17:00:00.000Z', '2026-11-16'],
  ])('stores the UTC time and the right due date at %s', async (_label, time, due) => {
    const app = createTestApp({ clock: fixedClock(new Date(time)) });
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    const copy = await createCopy(type.id);

    const response = await checkout(app, cookie, req.id, { copyId: copy.id });

    expect(response.status).toBe(201);
    expect(response.body.dueDate).toBe(due);
    const loan = await prisma.loan.findUniqueOrThrow({ where: { requestId: req.id } });
    expect(loan.checkedOutAt.toISOString()).toBe(time);
    expect(loan.dueDate.toISOString()).toBe(`${due}T00:00:00.000Z`);
  });
});

describe('TEST-F04-04 refused copies change nothing (AC-F04-04, BR-02, BR-17)', () => {
  it('refuses a copy that is On loan or In maintenance with 409 COPY_NOT_AVAILABLE', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    const onLoan = await createCopy(type.id);
    const inMaintenance = await createCopy(type.id);
    await prisma.copy.update({ where: { id: onLoan.id }, data: { status: 'ON_LOAN' } });
    await prisma.copy.update({
      where: { id: inMaintenance.id },
      data: { status: 'IN_MAINTENANCE' },
    });
    const before = await snapshot();

    const first = await checkout(app, cookie, req.id, { copyId: onLoan.id });
    const second = await checkout(app, cookie, req.id, { copyId: inMaintenance.id });

    for (const response of [first, second]) {
      expect(response.status).toBe(409);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('COPY_NOT_AVAILABLE');
    }
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a copy of another type or of another lab with 409 COPY_MISMATCH', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const otherType = await createEquipmentType(lab.id);
    const otherLab = await setUpLab();
    // The custodian is assigned to both labs, so the copy is visible and only the type or lab differs.
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id, otherLab.lab.id]);
    const req = await pendingRequest(type.id);
    const wrongType = await createCopy(otherType.id);
    const wrongLab = await createCopy(otherLab.type.id);
    const before = await snapshot();

    const first = await checkout(app, cookie, req.id, { copyId: wrongType.id });
    const second = await checkout(app, cookie, req.id, { copyId: wrongLab.id });

    for (const response of [first, second]) {
      expect(response.status).toBe(409);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('COPY_MISMATCH');
    }
    expect(await snapshot()).toEqual(before);
  });

  it('returns 404 for a copy id that does not exist', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    const before = await snapshot();

    const response = await checkout(app, cookie, req.id, { copyId: 999999 });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
    expect(await snapshot()).toEqual(before);
  });
});

describe('TEST-F04-05 concurrent checkouts (AC-F04-05, BR-01, NFR-05)', () => {
  it('gives exactly one loan and nine refusals for 10 checkouts of one copy', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const copy = await createCopy(type.id);
    const requests = [];
    for (let index = 0; index < 10; index += 1) {
      requests.push(await pendingRequest(type.id));
    }

    const responses = await Promise.all(
      requests.map((req) => checkout(app, cookie, req.id, { copyId: copy.id })),
    );

    const statuses = responses.map(({ status }) => status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(9);
    expect(statuses).not.toContain(503);
    for (const response of responses.filter(({ status }) => status === 409)) {
      expect(apiErrorSchema.parse(response.body).error.code).toBe('COPY_NOT_AVAILABLE');
    }
    expect(await prisma.loan.count({ where: { copyId: copy.id, status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.borrowRequest.count({ where: { status: 'FULFILLED' } })).toBe(1);
    expect(await prisma.borrowRequest.count({ where: { status: 'PENDING' } })).toBe(9);
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'ON_LOAN',
    );
    expect(await prisma.statusHistory.count()).toBe(3);
  });

  it('gives one 201 and one 409 INVALID_STATUS for two checkouts of one request with two copies', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    const first = await createCopy(type.id);
    const second = await createCopy(type.id);

    const responses = await Promise.all([
      checkout(app, cookie, req.id, { copyId: first.id }),
      checkout(app, cookie, req.id, { copyId: second.id }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const refused = responses.find(({ status }) => status === 409)!;
    expect(apiErrorSchema.parse(refused.body).error.code).toBe('INVALID_STATUS');
    expect(await prisma.loan.count()).toBe(1);
    expect(await prisma.copy.count({ where: { status: 'ON_LOAN' } })).toBe(1);
    expect(await prisma.copy.count({ where: { status: 'AVAILABLE' } })).toBe(1);
  });
});

describe('TEST-F04-06 a borrower is refused (AC-F04-06, NFR-03)', () => {
  it('returns 403 FORBIDDEN on the list, the available copies, and checkout, and changes nothing', async () => {
    const app = createTestApp();
    const { type } = await setUpLab();
    const { cookie } = await signIn(app, 'BORROWER');
    const req = await pendingRequest(type.id);
    const copy = await createCopy(type.id);
    const before = await snapshot();

    const responses = [
      await get(app, cookie, '/api/custodian/requests'),
      await get(app, cookie, `/api/custodian/requests/${req.id}/available-copies`),
      await checkout(app, cookie, req.id, { copyId: copy.id }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('FORBIDDEN');
    }
    expect(await snapshot()).toEqual(before);
  });
});

describe('TEST-F04-07 an unassigned lab is 404 (AC-F04-07, BR-15, NFR-03)', () => {
  it('returns 404 for a request and a copy in an unassigned lab, and changes nothing', async () => {
    const app = createTestApp();
    const a = await setUpLab();
    const b = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [a.lab.id]);
    const requestInB = await pendingRequest(b.type.id);
    const copyInB = await createCopy(b.type.id);
    const requestInA = await pendingRequest(a.type.id);
    const before = await snapshot();

    const responses = [
      await get(app, cookie, `/api/custodian/requests/${requestInB.id}/available-copies`),
      await checkout(app, cookie, requestInB.id, { copyId: copyInB.id }),
      await checkout(app, cookie, requestInA.id, { copyId: copyInB.id }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
    }
    expect(await snapshot()).toEqual(before);
  });

  it('returns 404 on a request id for a custodian with no assigned lab', async () => {
    const app = createTestApp();
    const { type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN');
    const req = await pendingRequest(type.id);
    const copy = await createCopy(type.id);

    const response = await checkout(app, cookie, req.id, { copyId: copy.id });

    expect(response.status).toBe(404);
  });

  it('returns 404 for an id that is not a positive integer', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'CUSTODIAN');

    for (const id of ['abc', '0', '-1', '1.5']) {
      expect((await checkout(app, cookie, id, { copyId: 1 })).status).toBe(404);
      const copies = await get(app, cookie, `/api/custodian/requests/${id}/available-copies`);
      expect(copies.status).toBe(404);
    }
  });
});

describe('TEST-F04-08 only a Pending request can be checked out (AC-F04-08, BR-06)', () => {
  it('returns 409 INVALID_STATUS for a Fulfilled, a Cancelled, and an already checked out request', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const fulfilled = await pendingRequest(type.id, { status: 'FULFILLED' });
    const cancelled = await pendingRequest(type.id, { status: 'CANCELLED' });
    const twice = await pendingRequest(type.id);
    const used = await createCopy(type.id);
    const free = await createCopy(type.id);
    expect((await checkout(app, cookie, twice.id, { copyId: used.id })).status).toBe(201);
    const before = await snapshot();

    const responses = [
      await checkout(app, cookie, fulfilled.id, { copyId: free.id }),
      await checkout(app, cookie, cancelled.id, { copyId: free.id }),
      await checkout(app, cookie, twice.id, { copyId: free.id }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(409);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('INVALID_STATUS');
    }
    expect(await snapshot()).toEqual(before);
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: free.id } })).status).toBe(
      'AVAILABLE',
    );
  });
});

describe('TEST-F04-09 the Available count drops by one (AC-F04-09, FR-09, FR-04)', () => {
  it('shows one fewer Available copy of the type in the catalog after checkout', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const borrower = await signIn(app, 'BORROWER');
    const req = await pendingRequest(type.id);
    const copies = [
      await createCopy(type.id),
      await createCopy(type.id),
      await createCopy(type.id),
    ];
    // The count a borrower sees in the catalog (F-02), for this type.
    const catalogCount = async () => {
      const response = await get(app, borrower.cookie, '/api/equipment-types');
      expect(response.status).toBe(200);
      const types = (
        response.body.items as { equipmentTypes: { id: number; availableCount: number }[] }[]
      ).flatMap((group) => group.equipmentTypes);
      return types.find((item) => item.id === type.id)?.availableCount;
    };
    expect(await catalogCount()).toBe(3);

    const response = await checkout(app, cookie, req.id, { copyId: copies[1].id });

    expect(response.status).toBe(201);
    expect(await catalogCount()).toBe(2);
  });
});

describe('Supporting check: body validation', () => {
  it.each([
    ['missing', {}],
    ['a string', { copyId: 'abc' }],
    ['zero', { copyId: 0 }],
    ['fractional', { copyId: 1.5 }],
    ['negative', { copyId: -3 }],
  ])('returns 400 with fields.copyId when copyId is %s', async (_label, body) => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    await createCopy(type.id);
    const before = await snapshot();

    const response = await checkout(app, cookie, req.id, body);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { copyId: 'Choose a copy.' },
    });
    expect(await snapshot()).toEqual(before);
  });
});

describe('Supporting check: a refused checkout writes no history and rolls back', () => {
  it('leaves no history entry after a refusal', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    const copy = await createCopy(type.id);
    await prisma.copy.update({ where: { id: copy.id }, data: { status: 'ON_LOAN' } });

    await checkout(app, cookie, req.id, { copyId: copy.id });

    expect(await prisma.statusHistory.count()).toBe(0);
  });

  it('rolls back the request, copy, and loan when the history write fails', async () => {
    const app = createTestApp();
    const { lab, type } = await setUpLab();
    const { cookie } = await signIn(app, 'CUSTODIAN', [lab.id]);
    const req = await pendingRequest(type.id);
    const copy = await createCopy(type.id);
    // A check constraint that every history row violates, so the first entry fails.
    await prisma.$executeRawUnsafe(
      'ALTER TABLE status_history ADD CONSTRAINT test_reject_history CHECK (false) NOT VALID',
    );
    try {
      const response = await checkout(app, cookie, req.id, { copyId: copy.id });

      expect(response.status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE status_history DROP CONSTRAINT test_reject_history',
      );
    }

    expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(
      'PENDING',
    );
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'AVAILABLE',
    );
    expect(await prisma.loan.count()).toBe(0);
    expect(await prisma.statusHistory.count()).toBe(0);
  });
});
