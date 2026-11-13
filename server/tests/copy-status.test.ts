import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { CopyStatus } from '@prisma/client';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { buildRoutes } from '../src/routes.js';
import { resetDatabase } from './helpers/database.js';
import {
  allowedOrigin,
  appDependencies,
  clockStart,
  createAccount,
  createTestApp,
  fixedClock,
  logIn,
  MINUTE,
  sessionCookie,
} from './helpers/app.js';
import { createCopy, createEquipmentType, createLoan, createRequest } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type Account = Awaited<ReturnType<typeof createAccount>>;

// A custodian assigned to Lab A, a borrower, and an equipment type in Lab A and in Lab B.
async function setUp(assign = true) {
  const clock = fixedClock();
  const app = createTestApp({ clock });
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  if (assign) {
    await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  }
  const typeA = await createEquipmentType(labA.id);
  const typeB = await createEquipmentType(labB.id);
  return { clock, app, custodian, borrower, labA, labB, typeA, typeB };
}

async function signIn(app: ReturnType<typeof createTestApp>, account: Account) {
  const response = await logIn(app, account.email);
  return sessionCookie(response)!;
}

function patchStatus(
  app: ReturnType<typeof createTestApp>,
  cookie: string,
  id: number | string,
  body?: unknown,
) {
  const call = request(app).patch(`/api/custodian/copies/${id}`).set('Cookie', cookie);
  return body === undefined ? call : call.send(body as object);
}

async function copyWithStatus(typeId: number, status: CopyStatus) {
  const copy = await createCopy(typeId);
  return prisma.copy.update({ where: { id: copy.id }, data: { status } });
}

function historyOf(copyId: number) {
  return prisma.statusHistory.findMany({
    where: { entityType: 'COPY', entityId: copyId },
    orderBy: { id: 'asc' },
  });
}

describe('TEST-F06-01 a custodian switches a copy between Available and In maintenance (AC-F06-01, AC-F07-01)', () => {
  it('switches in both directions and records one history entry for each switch', async () => {
    const { app, clock, custodian, labA, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const copy = await createCopy(typeA.id);

    const toMaintenance = await patchStatus(app, cookie, copy.id, { status: 'IN_MAINTENANCE' });
    clock.advance(MINUTE);
    const toAvailable = await patchStatus(app, cookie, copy.id, { status: 'AVAILABLE' });

    expect(toMaintenance.status).toBe(200);
    expect(toMaintenance.body).toEqual({
      id: copy.id,
      assetTag: copy.assetTag,
      status: 'IN_MAINTENANCE',
      equipmentType: { id: typeA.id, name: typeA.name },
      lab: { id: labA.id, name: 'Lab A' },
    });
    expect(toAvailable.status).toBe(200);
    expect(toAvailable.body.status).toBe('AVAILABLE');
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'AVAILABLE',
    );

    const history = await historyOf(copy.id);
    expect(
      history.map(({ oldStatus, newStatus, actorId, labId, createdAt }) => ({
        oldStatus,
        newStatus,
        actorId,
        labId,
        createdAt,
      })),
    ).toEqual([
      {
        oldStatus: 'AVAILABLE',
        newStatus: 'IN_MAINTENANCE',
        actorId: custodian.id,
        labId: labA.id,
        createdAt: new Date(clockStart.getTime()),
      },
      {
        oldStatus: 'IN_MAINTENANCE',
        newStatus: 'AVAILABLE',
        actorId: custodian.id,
        labId: labA.id,
        createdAt: new Date(clockStart.getTime() + MINUTE),
      },
    ]);
  });
});

describe('TEST-F06-02 an On loan copy cannot be changed, and On loan and Retired are not targets (AC-F06-02, AC-F07-02)', () => {
  it('refuses to change an On loan copy and stores no history entry', async () => {
    const { app, custodian, borrower, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const copy = await copyWithStatus(typeA.id, 'ON_LOAN');
    const loanRequest = await createRequest(borrower.id, typeA.id, 'FULFILLED');
    await createLoan(loanRequest.id, copy.id, borrower.id, custodian.id);

    for (const status of ['IN_MAINTENANCE', 'AVAILABLE']) {
      const response = await patchStatus(app, cookie, copy.id, { status });

      expect(response.status).toBe(409);
      expect(apiErrorSchema.strict().parse(response.body)).toEqual({
        error: { code: 'INVALID_STATUS', message: 'A copy that is on loan cannot be changed.' },
      });
    }
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'ON_LOAN',
    );
    expect(await prisma.statusHistory.count()).toBe(0);
  });

  it('refuses On loan and Retired as target statuses with a field message', async () => {
    const { app, custodian, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const copy = await createCopy(typeA.id);

    for (const status of ['ON_LOAN', 'RETIRED']) {
      const response = await patchStatus(app, cookie, copy.id, { status });

      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(response.body).error).toMatchObject({
        code: 'VALIDATION_ERROR',
        fields: { status: 'Choose Available or In maintenance.' },
      });
    }
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'AVAILABLE',
    );
    expect(await prisma.statusHistory.count()).toBe(0);
  });

  it('refuses to change a Retired copy', async () => {
    const { app, custodian, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const copy = await copyWithStatus(typeA.id, 'RETIRED');

    const response = await patchStatus(app, cookie, copy.id, { status: 'AVAILABLE' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'INVALID_STATUS',
      message: 'This copy cannot be changed to that status.',
    });
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'RETIRED',
    );
    expect(await prisma.statusHistory.count()).toBe(0);
  });
});

describe('TEST-F06-03 role and lab scope (AC-F06-03, BR-15, NFR-03)', () => {
  it('gives a borrower 403, an unassigned lab 404, and no session 401, and changes nothing', async () => {
    const { app, custodian, borrower, typeB } = await setUp();
    const custodianCookie = await signIn(app, custodian);
    const borrowerCookie = await signIn(app, borrower);
    const copy = await createCopy(typeB.id);
    const body = { status: 'IN_MAINTENANCE' };

    const unassigned = await patchStatus(app, custodianCookie, copy.id, body);
    const missing = await patchStatus(app, custodianCookie, copy.id + 1000, body);
    const notAnId = await patchStatus(app, custodianCookie, 'abc', body);
    const asBorrower = await patchStatus(app, borrowerCookie, copy.id, body);
    const noSession = await request(app).patch(`/api/custodian/copies/${copy.id}`).send(body);

    expect(unassigned.status).toBe(404);
    expect(apiErrorSchema.strict().parse(unassigned.body)).toEqual({
      error: { code: 'NOT_FOUND', message: 'Copy not found.' },
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(unassigned.body);
    expect(notAnId.status).toBe(404);
    expect(notAnId.body).toEqual(unassigned.body);
    expect(asBorrower.status).toBe(403);
    expect(asBorrower.body.error.code).toBe('FORBIDDEN');
    expect(noSession.status).toBe(401);
    expect(noSession.body.error.code).toBe('UNAUTHENTICATED');
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'AVAILABLE',
    );
    expect(await prisma.statusHistory.count()).toBe(0);
  });
});

describe('Supporting check: the copy list', () => {
  it('lists the copies of every assigned lab in order, with every status, and not other labs', async () => {
    const { app, custodian, labA, labB, typeA } = await setUp();
    const labC = await prisma.lab.create({ data: { name: 'Lab 0' } });
    await prisma.labAssignment.create({ data: { labId: labC.id, custodianId: custodian.id } });
    const typeC = await prisma.equipmentType.create({
      data: { labId: labC.id, name: 'Scope', category: 'Meters', description: 'Fixture' },
    });
    const typeA2 = await prisma.equipmentType.create({
      data: { labId: labA.id, name: 'Aardvark', category: 'Boards', description: 'Fixture' },
    });
    const typeOther = await createEquipmentType(labB.id);
    const a2 = await createCopy(typeA.id, 'A-2');
    const a1 = await createCopy(typeA.id, 'A-1');
    const aa = await copyWithStatus(typeA2.id, 'RETIRED');
    const c1 = await copyWithStatus(typeC.id, 'ON_LOAN');
    await createCopy(typeOther.id, 'B-1');
    const cookie = await signIn(app, custodian);

    const response = await request(app).get('/api/custodian/copies').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      {
        id: c1.id,
        assetTag: c1.assetTag,
        status: 'ON_LOAN',
        equipmentType: { id: typeC.id, name: 'Scope' },
        lab: { id: labC.id, name: 'Lab 0' },
      },
      {
        id: aa.id,
        assetTag: aa.assetTag,
        status: 'RETIRED',
        equipmentType: { id: typeA2.id, name: 'Aardvark' },
        lab: { id: labA.id, name: 'Lab A' },
      },
      {
        id: a1.id,
        assetTag: 'A-1',
        status: 'AVAILABLE',
        equipmentType: { id: typeA.id, name: typeA.name },
        lab: { id: labA.id, name: 'Lab A' },
      },
      {
        id: a2.id,
        assetTag: 'A-2',
        status: 'AVAILABLE',
        equipmentType: { id: typeA.id, name: typeA.name },
        lab: { id: labA.id, name: 'Lab A' },
      },
    ]);
  });

  it('gives a custodian with no assigned lab an empty list and a 404 on a switch', async () => {
    const { app, custodian, typeA } = await setUp(false);
    const cookie = await signIn(app, custodian);
    const copy = await createCopy(typeA.id);

    const list = await request(app).get('/api/custodian/copies').set('Cookie', cookie);
    const change = await patchStatus(app, cookie, copy.id, { status: 'IN_MAINTENANCE' });

    expect(list.status).toBe(200);
    expect(list.body).toEqual({ items: [] });
    expect(change.status).toBe(404);
  });

  it('gives a borrower 403 and a call with no session 401', async () => {
    const { app, borrower } = await setUp();
    const cookie = await signIn(app, borrower);

    const asBorrower = await request(app).get('/api/custodian/copies').set('Cookie', cookie);
    const noSession = await request(app).get('/api/custodian/copies');

    expect(asBorrower.status).toBe(403);
    expect(asBorrower.body.error.code).toBe('FORBIDDEN');
    expect(noSession.status).toBe(401);
    expect(noSession.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses an unknown query parameter with 400', async () => {
    const { app, custodian } = await setUp();
    const cookie = await signIn(app, custodian);

    const response = await request(app)
      .get('/api/custodian/copies?status=AVAILABLE')
      .set('Cookie', cookie);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { status: 'Unknown parameter.' },
    });
  });
});

describe('Supporting check: the switch request', () => {
  it.each([
    ['a missing body', undefined],
    ['a missing status', {}],
    ['a lower-case value', { status: 'available' }],
    ['a non-string value', { status: 5 }],
  ])('refuses %s with a field message and changes nothing', async (_label, body) => {
    const { app, custodian, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const copy = await createCopy(typeA.id);

    const response = await patchStatus(app, cookie, copy.id, body);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { status: 'Choose Available or In maintenance.' },
    });
    expect(await prisma.statusHistory.count()).toBe(0);
  });

  it('refuses a switch to the status the copy already has and records nothing', async () => {
    const { app, custodian, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const copy = await createCopy(typeA.id);

    const response = await patchStatus(app, cookie, copy.id, { status: 'AVAILABLE' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'INVALID_STATUS',
      message: 'This copy already has that status.',
    });
    expect(await prisma.statusHistory.count()).toBe(0);
  });

  it('lets only one of two parallel switches win and records one entry', async () => {
    const { app, custodian, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const copy = await createCopy(typeA.id);

    const responses = await Promise.all([
      patchStatus(app, cookie, copy.id, { status: 'IN_MAINTENANCE' }),
      patchStatus(app, cookie, copy.id, { status: 'IN_MAINTENANCE' }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await historyOf(copy.id)).toHaveLength(1);
  });

  it('refuses a request from another origin and changes nothing', async () => {
    const { app, custodian, typeA } = await setUp();
    const cookie = await signIn(app, custodian);
    const copy = await createCopy(typeA.id);

    const evil = await patchStatus(app, cookie, copy.id, { status: 'IN_MAINTENANCE' }).set(
      'Origin',
      'https://evil.example',
    );
    const allowed = await patchStatus(app, cookie, copy.id, { status: 'IN_MAINTENANCE' }).set(
      'Origin',
      allowedOrigin,
    );

    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('INVALID_ORIGIN');
    expect(allowed.status).toBe(200);
    expect(await historyOf(copy.id)).toHaveLength(1);
  });
});

describe('Supporting check: the route table', () => {
  it('registers both copy routes for custodians', () => {
    const entries = buildRoutes(appDependencies()).map(
      ({ method, path, access }) => `${method.toUpperCase()} ${path} ${access}`,
    );

    expect(entries).toContain('GET /api/custodian/copies CUSTODIAN');
    expect(entries).toContain('PATCH /api/custodian/copies/:id CUSTODIAN');
  });
});
