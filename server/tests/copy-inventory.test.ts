import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { CopyStatus } from '@prisma/client';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, fixedClock, logIn, sessionCookie } from './helpers/app.js';
import { createEquipmentType, createLoan, createRequest } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type App = ReturnType<typeof createTestApp>;

const noon = new Date('2026-11-10T05:00:00.000Z');

async function setUp() {
  const app = createTestApp({ clock: fixedClock(noon) });
  const custodian = await createAccount('CUSTODIAN');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  const typeA = await createEquipmentType(labA.id);
  const typeB = await createEquipmentType(labB.id);
  const cookie = sessionCookie(await logIn(app, custodian.email))!;
  return { app, custodian, cookie, labA, labB, typeA, typeB };
}

const addCopy = (app: App, cookie: string, body: unknown) =>
  request(app)
    .post('/api/custodian/copies')
    .set('Cookie', cookie)
    .send(body as object);
const patchStatus = (app: App, cookie: string, id: number, status: string) =>
  request(app).patch(`/api/custodian/copies/${id}`).set('Cookie', cookie).send({ status });

const codeOf = (response: { body: unknown }) => apiErrorSchema.parse(response.body).error.code;

function copyWith(typeId: number, assetTag: string, status: CopyStatus = 'AVAILABLE') {
  return prisma.copy.create({ data: { equipmentTypeId: typeId, assetTag, status } });
}

describe('TEST-F13-01 add a copy (AC-F13-01, AC-F13-02, FR-16, F-07)', () => {
  it('creates an Available copy, lists it, counts it, and records the history entry', async () => {
    const { app, custodian, cookie, labA, typeA } = await setUp();
    await copyWith(typeA.id, 'OLD-1');

    const response = await addCopy(app, cookie, {
      equipmentTypeId: typeA.id,
      assetTag: '  NEW-1 ',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      assetTag: 'NEW-1',
      status: 'AVAILABLE',
      equipmentType: { id: typeA.id },
      lab: { id: labA.id },
    });
    const listed = await request(app).get('/api/custodian/copies').set('Cookie', cookie);
    expect(listed.body.items.map((c: { assetTag: string }) => c.assetTag).sort()).toEqual([
      'NEW-1',
      'OLD-1',
    ]);
    const borrower = await createAccount('BORROWER');
    const catalog = await request(app)
      .get(`/api/equipment-types/${typeA.id}`)
      .set('Cookie', sessionCookie(await logIn(app, borrower.email))!);
    expect(catalog.body.availableCount).toBe(2);
    const history = await prisma.statusHistory.findMany();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      entityType: 'COPY',
      entityId: response.body.id,
      labId: labA.id,
      oldStatus: null,
      newStatus: 'AVAILABLE',
      actorId: custodian.id,
      createdAt: noon,
    });
  });
});

describe('TEST-F13-02 asset tags are unique and validated (AC-F13-03, BR-12)', () => {
  it('refuses a duplicate tag in any lab, a bad tag, and writes nothing', async () => {
    const { app, custodian, cookie, typeA } = await setUp();
    const labC = await prisma.lab.create({ data: { name: 'Lab C' } });
    await prisma.labAssignment.create({ data: { labId: labC.id, custodianId: custodian.id } });
    const typeC = await createEquipmentType(labC.id);
    await copyWith(typeA.id, 'A-1');

    const sameLab = await addCopy(app, cookie, { equipmentTypeId: typeA.id, assetTag: 'A-1' });
    const otherLab = await addCopy(app, cookie, { equipmentTypeId: typeC.id, assetTag: 'A-1' });
    const empty = await addCopy(app, cookie, { equipmentTypeId: typeA.id, assetTag: '   ' });
    const long = await addCopy(app, cookie, {
      equipmentTypeId: typeA.id,
      assetTag: 'x'.repeat(51),
    });
    const noType = await addCopy(app, cookie, { assetTag: 'A-2' });

    for (const response of [sameLab, otherLab]) {
      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('DUPLICATE_ASSET_TAG');
      expect(response.body.error.fields).toHaveProperty('assetTag');
    }
    for (const [response, field] of [
      [empty, 'assetTag'],
      [long, 'assetTag'],
      [noType, 'equipmentTypeId'],
    ] as const) {
      expect(response.status).toBe(400);
      expect(codeOf(response)).toBe('VALIDATION_ERROR');
      expect(Object.keys(response.body.error.fields)).toContain(field);
    }
    expect(await prisma.copy.count()).toBe(1);
    expect(await prisma.statusHistory.count()).toBe(0);
  });

  it('lets exactly one of 5 parallel adds of one tag through', async () => {
    const { app, cookie, typeA } = await setUp();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        addCopy(app, cookie, { equipmentTypeId: typeA.id, assetTag: 'RACE-1' }),
      ),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await prisma.copy.count()).toBe(1);
    expect(await prisma.statusHistory.count()).toBe(1);
  });
});

describe('TEST-F13-03 scope and roles (AC-F13-04, BR-15)', () => {
  it('gives 404 for another lab and a missing type or copy, and changes nothing', async () => {
    const { app, cookie, typeB } = await setUp();
    const theirs = await copyWith(typeB.id, 'B-1');

    const addOther = await addCopy(app, cookie, { equipmentTypeId: typeB.id, assetTag: 'B-2' });
    const addMissing = await addCopy(app, cookie, { equipmentTypeId: 999999, assetTag: 'B-3' });
    const retireOther = await patchStatus(app, cookie, theirs.id, 'RETIRED');
    const retireMissing = await patchStatus(app, cookie, 999999, 'RETIRED');

    for (const response of [addOther, addMissing, retireOther, retireMissing]) {
      expect(response.status).toBe(404);
      expect(codeOf(response)).toBe('NOT_FOUND');
    }
    expect(await prisma.copy.count()).toBe(1);
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe(
      'AVAILABLE',
    );
    expect(await prisma.statusHistory.count()).toBe(0);
  });

  it('is closed to a borrower and to no session', async () => {
    const { app, typeA } = await setUp();
    const borrower = await createAccount('BORROWER');
    const borrowerCookie = sessionCookie(await logIn(app, borrower.email))!;

    const body = { equipmentTypeId: typeA.id, assetTag: 'X-1' };
    expect((await addCopy(app, borrowerCookie, body)).status).toBe(403);
    expect((await request(app).post('/api/custodian/copies').send(body)).status).toBe(401);
    expect(await prisma.copy.count()).toBe(0);
  });
});

describe('TEST-F13-04 retire an Available or In maintenance copy (AC-F13-05, BR-08)', () => {
  it('retires both and records the real old status', async () => {
    const { app, custodian, cookie, typeA } = await setUp();
    const available = await copyWith(typeA.id, 'R-1', 'AVAILABLE');
    const maintenance = await copyWith(typeA.id, 'R-2', 'IN_MAINTENANCE');

    const first = await patchStatus(app, cookie, available.id, 'RETIRED');
    const second = await patchStatus(app, cookie, maintenance.id, 'RETIRED');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body).toMatchObject({ id: available.id, status: 'RETIRED' });
    const history = await prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });
    expect(history.map((h) => [h.entityId, h.oldStatus, h.newStatus, h.actorId])).toEqual([
      [available.id, 'AVAILABLE', 'RETIRED', custodian.id],
      [maintenance.id, 'IN_MAINTENANCE', 'RETIRED', custodian.id],
    ]);
  });
});

describe('TEST-F13-05 what cannot be retired or changed (AC-F13-06, BR-08)', () => {
  it('refuses On loan to Retired and every change of a Retired copy, and writes nothing', async () => {
    const { app, custodian, cookie, typeA } = await setUp();
    const borrower = await createAccount('BORROWER');
    const onLoan = await copyWith(typeA.id, 'L-1', 'ON_LOAN');
    const loanRequest = await createRequest(borrower.id, typeA.id, 'FULFILLED');
    await createLoan(loanRequest.id, onLoan.id, borrower.id, custodian.id);
    const retired = await copyWith(typeA.id, 'D-1', 'RETIRED');

    const loanRetire = await patchStatus(app, cookie, onLoan.id, 'RETIRED');
    const attempts = [];
    for (const status of ['RETIRED', 'AVAILABLE', 'IN_MAINTENANCE']) {
      attempts.push(await patchStatus(app, cookie, retired.id, status));
    }
    const toOnLoan = await patchStatus(app, cookie, retired.id, 'ON_LOAN');

    expect(loanRetire.status).toBe(409);
    expect(loanRetire.body.error).toEqual({
      code: 'INVALID_STATUS',
      message: 'A copy that is on loan cannot be changed.',
    });
    for (const response of attempts) {
      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('INVALID_STATUS');
    }
    expect(toOnLoan.status).toBe(400);
    expect(toOnLoan.body.error.fields.status).toBe('Choose Available, In maintenance, or Retired.');
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: retired.id } })).status).toBe(
      'RETIRED',
    );
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: onLoan.id } })).status).toBe(
      'ON_LOAN',
    );
    expect(await prisma.statusHistory.count()).toBe(0);
  });
});

describe('TEST-F13-06 parallel retire requests (AC-F13-07, BR-08, NFR-05)', () => {
  it('gives one 200, four 409, and one history entry', async () => {
    const { app, cookie, typeA } = await setUp();
    const copy = await copyWith(typeA.id, 'P-1');

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => patchStatus(app, cookie, copy.id, 'RETIRED')),
    );

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await prisma.statusHistory.count()).toBe(1);
  });
});

describe('TEST-F13-07 a retired copy is out of circulation (AC-F13-08, FR-16)', () => {
  it('is not counted as available and is not offered at checkout', async () => {
    const { app, cookie, typeA } = await setUp();
    const copy = await copyWith(typeA.id, 'C-1');
    const borrower = await createAccount('BORROWER');
    const pending = await createRequest(borrower.id, typeA.id, 'PENDING');
    const borrowerCookie = sessionCookie(await logIn(app, borrower.email))!;

    const retire = await patchStatus(app, cookie, copy.id, 'RETIRED');
    const detail = await request(app)
      .get(`/api/equipment-types/${typeA.id}`)
      .set('Cookie', borrowerCookie);
    const offered = await request(app)
      .get(`/api/custodian/requests/${pending.id}/available-copies`)
      .set('Cookie', cookie);

    expect(retire.status).toBe(200);
    expect(detail.body.availableCount).toBe(0);
    expect(offered.status).toBe(200);
    expect(offered.body.items ?? offered.body).toEqual([]);
  });
});
