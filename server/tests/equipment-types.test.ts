import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, fixedClock, logIn, sessionCookie } from './helpers/app.js';
import { createCopy, createRequest } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type App = ReturnType<typeof createTestApp>;

const noon = new Date('2026-11-10T05:00:00.000Z');
const valid = { name: 'Oscilloscope', category: 'Meters', description: 'Two channels.' };

async function setUp() {
  const app = createTestApp({ clock: fixedClock(noon) });
  const custodian = await createAccount('CUSTODIAN');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  const cookie = sessionCookie(await logIn(app, custodian.email))!;
  return { app, custodian, cookie, labA, labB };
}

const post = (app: App, cookie: string, body: unknown) =>
  request(app)
    .post('/api/custodian/equipment-types')
    .set('Cookie', cookie)
    .send(body as object);
const patch = (app: App, cookie: string, id: number, body: unknown) =>
  request(app)
    .patch(`/api/custodian/equipment-types/${id}`)
    .set('Cookie', cookie)
    .send(body as object);
const list = (app: App, cookie: string) =>
  request(app).get('/api/custodian/equipment-types').set('Cookie', cookie);

const codeOf = (response: { body: unknown }) => apiErrorSchema.parse(response.body).error.code;

function makeType(labId: number, name: string, loanPeriodDays = 7) {
  return prisma.equipmentType.create({
    data: { labId, name, category: 'Boards', description: 'Fixture.', loanPeriodDays },
  });
}

describe('TEST-F12-01 create (AC-F12-01, FR-15)', () => {
  it('creates a type in an assigned lab and shows it in the catalog with no copies', async () => {
    const { app, cookie, labA } = await setUp();

    const created = await post(app, cookie, { ...valid, labId: labA.id, loanPeriodDays: 10 });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...valid, loanPeriodDays: 10, lab: { id: labA.id } });
    const row = await prisma.equipmentType.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row).toMatchObject({ ...valid, labId: labA.id, loanPeriodDays: 10 });
    const borrower = await createAccount('BORROWER');
    const catalog = await request(app)
      .get('/api/equipment-types')
      .set('Cookie', sessionCookie(await logIn(app, borrower.email))!);
    const listed = catalog.body.items[0].equipmentTypes.find(
      (t: { id: number }) => t.id === created.body.id,
    );
    expect(listed).toMatchObject({ name: valid.name, availableCount: 0 });
  });

  it('trims the fields', async () => {
    const { app, cookie, labA } = await setUp();

    const created = await post(app, cookie, {
      labId: labA.id,
      name: '  Scope  ',
      category: ' Meters ',
      description: ' Text ',
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Scope', category: 'Meters', description: 'Text' });
  });
});

describe('TEST-F12-02 edit (AC-F12-02, FR-15)', () => {
  it('changes all four fields and keeps the lab', async () => {
    const { app, cookie, labA } = await setUp();
    const type = await makeType(labA.id, 'Old name');

    const response = await patch(app, cookie, type.id, {
      name: 'New name',
      category: 'Tools',
      description: 'New text.',
      loanPeriodDays: 14,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: type.id,
      name: 'New name',
      category: 'Tools',
      description: 'New text.',
      loanPeriodDays: 14,
      lab: { id: labA.id },
    });
    expect(await prisma.equipmentType.findUniqueOrThrow({ where: { id: type.id } })).toMatchObject({
      name: 'New name',
      loanPeriodDays: 14,
      labId: labA.id,
    });
  });

  it('accepts an edit that changes nothing', async () => {
    const { app, cookie, labA } = await setUp();
    const type = await makeType(labA.id, 'Same');

    const response = await patch(app, cookie, type.id, {
      name: 'Same',
      category: 'Boards',
      description: 'Fixture.',
      loanPeriodDays: 7,
    });

    expect(response.status).toBe(200);
  });
});

describe('TEST-F12-03 validation (AC-F12-03, BR-05)', () => {
  it('refuses a bad loan period, name, category, or description and changes nothing', async () => {
    const { app, cookie, labA } = await setUp();
    const type = await makeType(labA.id, 'Keep');
    const edit = { name: 'Keep', category: 'Boards', description: 'Fixture.', loanPeriodDays: 7 };

    for (const [field, value] of [
      ['loanPeriodDays', 0],
      ['loanPeriodDays', 15],
      ['loanPeriodDays', 30],
      ['loanPeriodDays', 7.5],
      ['loanPeriodDays', '7'],
      ['name', ''],
      ['name', '   '],
      ['name', 'x'.repeat(101)],
      ['category', ''],
      ['category', 'x'.repeat(51)],
      ['description', ''],
      ['description', 'x'.repeat(1001)],
    ] as const) {
      const edited = await patch(app, cookie, type.id, { ...edit, [field]: value });
      expect(edited.status, `${field}=${String(value)}`).toBe(400);
      expect(codeOf(edited)).toBe('VALIDATION_ERROR');
      expect(Object.keys(edited.body.error.fields)).toContain(field);

      const created = await post(app, cookie, { ...edit, labId: labA.id, [field]: value });
      expect(created.status, `create ${field}=${String(value)}`).toBe(400);
    }

    expect(await prisma.equipmentType.count()).toBe(1);
    expect(await prisma.equipmentType.findUniqueOrThrow({ where: { id: type.id } })).toMatchObject({
      name: 'Keep',
      loanPeriodDays: 7,
    });
  });

  it('defaults an omitted loan period to 7 on create and accepts 1 and 14', async () => {
    const { app, cookie, labA } = await setUp();

    const defaulted = await post(app, cookie, { ...valid, labId: labA.id });
    const one = await post(app, cookie, {
      ...valid,
      name: 'One',
      labId: labA.id,
      loanPeriodDays: 1,
    });
    const fourteen = await post(app, cookie, {
      ...valid,
      name: 'Fourteen',
      labId: labA.id,
      loanPeriodDays: 14,
    });

    expect(defaulted.body.loanPeriodDays).toBe(7);
    expect(one.status).toBe(201);
    expect(fourteen.status).toBe(201);
  });

  it('says the allowed range is 1 to 14 days when the period is too long', async () => {
    const { app, cookie, labA } = await setUp();

    const response = await post(app, cookie, { ...valid, labId: labA.id, loanPeriodDays: 15 });

    expect(response.status).toBe(400);
    expect(response.body.error.fields.loanPeriodDays).toContain('1 to 14');
  });

  it('refuses a missing lab id and a missing edit field', async () => {
    const { app, cookie, labA } = await setUp();
    const type = await makeType(labA.id, 'Keep');

    expect((await post(app, cookie, valid)).status).toBe(400);
    expect((await patch(app, cookie, type.id, { name: 'Only a name' })).status).toBe(400);
  });
});

describe('TEST-F12-04 scope (AC-F12-04, BR-15)', () => {
  it('returns 404 for another lab and lists only assigned labs', async () => {
    const { app, cookie, labA, labB } = await setUp();
    const mine = await makeType(labA.id, 'Mine');
    const theirs = await makeType(labB.id, 'Theirs');

    const created = await post(app, cookie, { ...valid, labId: labB.id });
    const edited = await patch(app, cookie, theirs.id, {
      name: 'Hacked',
      category: 'Boards',
      description: 'x',
      loanPeriodDays: 7,
    });
    const missing = await patch(app, cookie, 999999, {
      name: 'x',
      category: 'Boards',
      description: 'x',
      loanPeriodDays: 7,
    });
    const listed = await list(app, cookie);

    expect(created.status).toBe(404);
    expect(edited.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(codeOf(edited)).toBe('NOT_FOUND');
    expect((await prisma.equipmentType.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe(
      'Theirs',
    );
    expect(await prisma.equipmentType.count({ where: { labId: labB.id } })).toBe(1);
    expect(listed.status).toBe(200);
    expect(listed.body.labs).toEqual([{ id: labA.id, name: 'Lab A' }]);
    expect(listed.body.items.map((t: { id: number }) => t.id)).toEqual([mine.id]);
  });

  it('refuses a bad id with 404 and an unknown query parameter with 400', async () => {
    const { app, cookie } = await setUp();

    const body = { name: 'x', category: 'x', description: 'x', loanPeriodDays: 7 };
    expect(
      (
        await request(app)
          .patch('/api/custodian/equipment-types/abc')
          .set('Cookie', cookie)
          .send(body)
      ).status,
    ).toBe(404);
    expect(
      (await request(app).get('/api/custodian/equipment-types?lab=1').set('Cookie', cookie)).status,
    ).toBe(400);
  });

  it('is closed to a borrower and to no session', async () => {
    const { app } = await setUp();
    const borrower = await createAccount('BORROWER');
    const borrowerCookie = sessionCookie(await logIn(app, borrower.email))!;

    expect((await list(app, borrowerCookie)).status).toBe(403);
    expect((await post(app, borrowerCookie, valid)).status).toBe(403);
    expect((await request(app).get('/api/custodian/equipment-types')).status).toBe(401);
  });
});

describe('TEST-F12-05 duplicate names (AC-F12-05)', () => {
  it('refuses a duplicate in one lab, accepts the same name in another lab', async () => {
    const { app, custodian, cookie, labA } = await setUp();
    const labC = await prisma.lab.create({ data: { name: 'Lab C' } });
    await prisma.labAssignment.create({ data: { labId: labC.id, custodianId: custodian.id } });
    await makeType(labA.id, 'Scope');
    const other = await makeType(labA.id, 'Other');

    const create = await post(app, cookie, { ...valid, name: 'Scope', labId: labA.id });
    const rename = await patch(app, cookie, other.id, {
      name: 'Scope',
      category: 'Boards',
      description: 'x',
      loanPeriodDays: 7,
    });
    const elsewhere = await post(app, cookie, { ...valid, name: 'Scope', labId: labC.id });

    expect(create.status).toBe(409);
    expect(codeOf(create)).toBe('DUPLICATE_NAME');
    expect(rename.status).toBe(409);
    expect(codeOf(rename)).toBe('DUPLICATE_NAME');
    expect(elsewhere.status).toBe(201);
    expect((await prisma.equipmentType.findUniqueOrThrow({ where: { id: other.id } })).name).toBe(
      'Other',
    );
  });

  it('lets exactly one of 5 parallel creates with one name through', async () => {
    const { app, cookie, labA } = await setUp();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post(app, cookie, { ...valid, labId: labA.id })),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    const refused = responses.filter((r) => r.status === 409);
    expect(refused).toHaveLength(4);
    expect(refused.every((r) => codeOf(r) === 'DUPLICATE_NAME')).toBe(true);
    expect(await prisma.equipmentType.count()).toBe(1);
  });
});

describe('TEST-F12-06 a new period affects new loans only (AC-F12-06, BR-05)', () => {
  it('keeps the due date of an existing loan and uses the new period at the next checkout', async () => {
    const { app, custodian, cookie, labA } = await setUp();
    const type = await makeType(labA.id, 'Scope', 7);
    const first = await createCopy(type.id, 'S-1');
    const second = await createCopy(type.id, 'S-2');
    const borrower = await createAccount('BORROWER');
    const firstRequest = await createRequest(borrower.id, type.id, 'PENDING');
    const checkout = (requestId: number, copyId: number) =>
      request(app)
        .post(`/api/custodian/requests/${requestId}/checkout`)
        .set('Cookie', cookie)
        .send({ copyId });

    const one = await checkout(firstRequest.id, first.id);
    await patch(app, cookie, type.id, {
      name: 'Scope',
      category: 'Boards',
      description: 'Fixture.',
      loanPeriodDays: 10,
    });
    const secondRequest = await createRequest(borrower.id, type.id, 'PENDING');
    const two = await checkout(secondRequest.id, second.id);

    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    const loans = await prisma.loan.findMany({
      where: { borrowerId: borrower.id },
      orderBy: { id: 'asc' },
    });
    expect(loans[0]!.dueDate.toISOString().slice(0, 10)).toBe('2026-11-17');
    expect(loans[1]!.dueDate.toISOString().slice(0, 10)).toBe('2026-11-20');
    expect(custodian.id).toBeGreaterThan(0);
  });
});
