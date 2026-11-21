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
type App = ReturnType<typeof createTestApp>;

// 10 November 2026, 12:00 in Bangkok. A loan due 10 November is not overdue, one due 9 is.
const noon = new Date('2026-11-10T05:00:00.000Z');

async function signIn(app: App, account: Account) {
  return sessionCookie(await logIn(app, account.email))!;
}

async function setUp() {
  const app = createTestApp({ clock: fixedClock(noon) });
  const custodian = await createAccount('CUSTODIAN');
  const lab = await prisma.lab.create({ data: { name: 'Lab A' } });
  await prisma.labAssignment.create({ data: { labId: lab.id, custodianId: custodian.id } });
  const custodianCookie = await signIn(app, custodian);
  return { app, custodian, custodianCookie, labId: lab.id };
}

// A type with one Available copy.
async function typeWithCopy(labId: number, tag: string) {
  const type = await createEquipmentType(labId);
  const copy = await createCopy(type.id, tag);
  return { type, copy };
}

// An active loan of a fresh type, with its copy On loan (checkout is F-04).
async function activeLoan(
  labId: number,
  borrowerId: number,
  custodianId: number,
  tag: string,
  dueDate = '2026-11-15',
) {
  const { type, copy } = await typeWithCopy(labId, tag);
  await prisma.copy.update({ where: { id: copy.id }, data: { status: 'ON_LOAN' } });
  const fulfilled = await createRequest(borrowerId, type.id, 'FULFILLED');
  return prisma.loan.create({
    data: {
      requestId: fulfilled.id,
      copyId: copy.id,
      borrowerId,
      checkedOutById: custodianId,
      checkedOutAt: new Date('2026-11-03T03:00:00.000Z'),
      dueDate: new Date(`${dueDate}T00:00:00.000Z`),
      status: 'ACTIVE',
    },
  });
}

async function pendingRequest(labId: number, borrowerId: number, tag: string) {
  const { type, copy } = await typeWithCopy(labId, tag);
  return { request: await createRequest(borrowerId, type.id, 'PENDING'), copy };
}

function submit(app: App, cookie: string, equipmentTypeId: number) {
  return request(app).post('/api/requests').set('Cookie', cookie).send({ equipmentTypeId });
}

function checkout(app: App, cookie: string, requestId: number, copyId: number) {
  return request(app)
    .post(`/api/custodian/requests/${requestId}/checkout`)
    .set('Cookie', cookie)
    .send({ copyId });
}

function codeOf(response: { body: unknown }) {
  return apiErrorSchema.parse(response.body).error.code;
}

describe('TEST-F11-01 the limit of 3 counts active loans and Pending requests on request (AC-F11-01, BR-10)', () => {
  it('accepts a request at 2 in total and refuses it at 3, with 2 loans + 1 Pending and 1 loan + 2 Pending', async () => {
    const { app, custodian, labId } = await setUp();

    for (const [loans, pendings] of [
      [2, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ]) {
      const borrower = await createAccount('BORROWER');
      for (let i = 0; i < loans; i += 1) {
        await activeLoan(labId, borrower.id, custodian.id, `L-${borrower.id}-${i}`);
      }
      for (let i = 0; i < pendings; i += 1) {
        await pendingRequest(labId, borrower.id, `P-${borrower.id}-${i}`);
      }
      const { type } = await typeWithCopy(labId, `N-${borrower.id}`);
      const before = await prisma.borrowRequest.count({ where: { borrowerId: borrower.id } });

      const response = await submit(app, await signIn(app, borrower), type.id);

      if (loans + pendings < 3) {
        expect(response.status).toBe(201);
      } else {
        expect(response.status).toBe(409);
        expect(codeOf(response)).toBe('LOAN_LIMIT_REACHED');
        expect(await prisma.borrowRequest.count({ where: { borrowerId: borrower.id } })).toBe(
          before,
        );
      }
    }
  });
});

describe('TEST-F11-02 the limit of 3 counts active loans only on checkout (AC-F11-02, BR-10)', () => {
  it('refuses a checkout at 3 active loans and accepts one at 2 loans + 2 Pending requests', async () => {
    const { app, custodian, custodianCookie, labId } = await setUp();

    const full = await createAccount('BORROWER');
    for (let i = 0; i < 3; i += 1) {
      await activeLoan(labId, full.id, custodian.id, `F-${i}`);
    }
    const blocked = await pendingRequest(labId, full.id, 'F-NEW');
    const refused = await checkout(app, custodianCookie, blocked.request.id, blocked.copy.id);

    const roomy = await createAccount('BORROWER');
    for (let i = 0; i < 2; i += 1) {
      await activeLoan(labId, roomy.id, custodian.id, `R-${i}`);
    }
    const first = await pendingRequest(labId, roomy.id, 'R-P1');
    await pendingRequest(labId, roomy.id, 'R-P2');
    const accepted = await checkout(app, custodianCookie, first.request.id, first.copy.id);

    expect(refused.status).toBe(409);
    expect(codeOf(refused)).toBe('LOAN_LIMIT_REACHED');
    const stillPending = await prisma.borrowRequest.findUniqueOrThrow({
      where: { id: blocked.request.id },
    });
    expect(stillPending.status).toBe('PENDING');
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: blocked.copy.id } })).status).toBe(
      'AVAILABLE',
    );
    expect(accepted.status).toBe(201);
  });
});

describe('TEST-F11-03 an overdue loan blocks new requests (AC-F11-03, BR-11)', () => {
  it('refuses a request with a loan due yesterday and accepts one with a loan due today', async () => {
    const { app, custodian, labId } = await setUp();
    const late = await createAccount('BORROWER');
    await activeLoan(labId, late.id, custodian.id, 'LATE', '2026-11-09');
    const onTime = await createAccount('BORROWER');
    await activeLoan(labId, onTime.id, custodian.id, 'TODAY', '2026-11-10');
    const { type } = await typeWithCopy(labId, 'WANTED');

    const refused = await submit(app, await signIn(app, late), type.id);
    const accepted = await submit(app, await signIn(app, onTime), type.id);

    expect(refused.status).toBe(409);
    expect(codeOf(refused)).toBe('HAS_OVERDUE_LOAN');
    expect(accepted.status).toBe(201);
  });
});

describe('TEST-F11-04 an overdue loan blocks checkout (AC-F11-04, BR-11)', () => {
  it('refuses the checkout and changes nothing', async () => {
    const { app, custodian, custodianCookie, labId } = await setUp();
    const borrower = await createAccount('BORROWER');
    await activeLoan(labId, borrower.id, custodian.id, 'LATE', '2026-11-09');
    const wanted = await pendingRequest(labId, borrower.id, 'WANTED');
    const historyBefore = await prisma.statusHistory.count();
    const loansBefore = await prisma.loan.count();

    const response = await checkout(app, custodianCookie, wanted.request.id, wanted.copy.id);

    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe('HAS_OVERDUE_LOAN');
    expect(
      (await prisma.borrowRequest.findUniqueOrThrow({ where: { id: wanted.request.id } })).status,
    ).toBe('PENDING');
    expect(await prisma.loan.count()).toBe(loansBefore);
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: wanted.copy.id } })).status).toBe(
      'AVAILABLE',
    );
    expect(await prisma.statusHistory.count()).toBe(historyBefore);
  });
});

describe('TEST-F11-05 returning the overdue loan lifts the block (AC-F11-05, BR-11)', () => {
  it('refuses, then accepts after the custodian records the return', async () => {
    const { app, custodian, custodianCookie, labId } = await setUp();
    const borrower = await createAccount('BORROWER');
    const late = await activeLoan(labId, borrower.id, custodian.id, 'LATE', '2026-11-09');
    const { type } = await typeWithCopy(labId, 'WANTED');
    const cookie = await signIn(app, borrower);

    const before = await submit(app, cookie, type.id);
    const returned = await request(app)
      .post(`/api/custodian/loans/${late.id}/return`)
      .set('Cookie', custodianCookie)
      .send({ note: 'Back.' });
    const after = await submit(app, cookie, type.id);

    expect(before.status).toBe(409);
    expect(returned.status).toBe(200);
    expect(after.status).toBe(201);
  });
});

describe('TEST-F11-06 parallel requests cannot pass the limit together (AC-F11-06, BR-10, NFR-05)', () => {
  it('gives exactly one 201 for 5 parallel requests with 2 slots used', async () => {
    const { app, custodian, labId } = await setUp();
    const borrower = await createAccount('BORROWER');
    await activeLoan(labId, borrower.id, custodian.id, 'L-1');
    await activeLoan(labId, borrower.id, custodian.id, 'L-2');
    const cookie = await signIn(app, borrower);
    const types = await Promise.all(
      Array.from({ length: 5 }, (_, i) => typeWithCopy(labId, `W-${i}`)),
    );

    const responses = await Promise.all(types.map(({ type }) => submit(app, cookie, type.id)));

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    const refused = responses.filter((r) => r.status === 409);
    expect(refused).toHaveLength(4);
    expect(refused.every((r) => codeOf(r) === 'LOAN_LIMIT_REACHED')).toBe(true);
  });
});
