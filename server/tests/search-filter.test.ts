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

type App = ReturnType<typeof createTestApp>;
type Account = Awaited<ReturnType<typeof createAccount>>;

const signIn = async (app: App, account: Account) =>
  sessionCookie(await logIn(app, account.email))!;

function type(labId: number, name: string, category: string) {
  return prisma.equipmentType.create({
    data: { labId, name, category, description: 'Fixture type' },
  });
}

async function setUp() {
  const app = createTestApp();
  const custodian = await createAccount('CUSTODIAN');
  const borrower = await createAccount('BORROWER');
  const other = await createAccount('BORROWER');
  const labA = await prisma.lab.create({ data: { name: 'Lab A' } });
  const labB = await prisma.lab.create({ data: { name: 'Lab B' } });
  await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
  return { app, custodian, borrower, other, labA, labB };
}

const names = (body: { items: { equipmentTypes: { name: string }[] }[] }) =>
  body.items.flatMap((group) => group.equipmentTypes.map((t) => t.name)).sort();

describe('TEST-F17-01 name search (AC-F17-01, FR-19)', () => {
  it('matches a substring without regard to case, and % and _ only as themselves', async () => {
    const { app, borrower, labA } = await setUp();
    await type(labA.id, 'Oscilloscope', 'Instruments');
    await type(labA.id, 'Logic analyzer', 'Instruments');
    await type(labA.id, '100% pure kit', 'Kits');
    await type(labA.id, 'Kit_A', 'Kits');
    const cookie = await signIn(app, borrower);
    const get = (query: string) =>
      request(app).get(`/api/equipment-types${query}`).set('Cookie', cookie);

    expect(names((await get('?q=scope')).body)).toEqual(['Oscilloscope']);
    expect(names((await get('?q=SCOPE')).body)).toEqual(['Oscilloscope']);
    expect(names((await get('?q=%25')).body)).toEqual(['100% pure kit']);
    expect(names((await get('?q=_')).body)).toEqual(['Kit_A']);
    expect(names((await get('?q=%20ANALYZ%20')).body)).toEqual(['Logic analyzer']);
    expect(names((await get('?q=nothing-like-this')).body)).toEqual([]);
  });
});

describe('TEST-F17-02 category, lab, and availability (AC-F17-02, FR-19)', () => {
  it('narrows the catalog by each filter and by a combination', async () => {
    const { app, borrower, labA, labB } = await setUp();
    const scope = await type(labA.id, 'Scope', 'Instruments');
    await type(labA.id, 'Probe', 'Instruments');
    const router = await type(labB.id, 'Router', 'Network');
    await type(labB.id, 'Meter', 'Instruments');
    await createCopy(scope.id, 'S-1');
    await createCopy(router.id, 'R-1');
    const retired = await createCopy(router.id, 'R-2');
    await prisma.copy.update({ where: { id: retired.id }, data: { status: 'RETIRED' } });
    const cookie = await signIn(app, borrower);
    const get = (query: string) =>
      request(app).get(`/api/equipment-types${query}`).set('Cookie', cookie);

    expect(names((await get('?category=Instruments')).body)).toEqual(['Meter', 'Probe', 'Scope']);
    expect(names((await get(`?labId=${labB.id}`)).body)).toEqual(['Meter', 'Router']);
    expect(names((await get('?available=true')).body)).toEqual(['Router', 'Scope']);
    expect(names((await get(`?category=Instruments&labId=${labB.id}`)).body)).toEqual(['Meter']);
    expect(names((await get(`?available=true&labId=${labA.id}&q=sco`)).body)).toEqual(['Scope']);
    expect(names((await get('')).body)).toHaveLength(4);
  });
});

describe('TEST-F17-03 custodian filters stay in the assigned labs (AC-F17-03, BR-15)', () => {
  it('filters requests and loans by lab and borrower and never leaks another lab', async () => {
    const { app, custodian, borrower, other, labA, labB } = await setUp();
    const typeA = await type(labA.id, 'A-type', 'X');
    const typeB = await type(labB.id, 'B-type', 'X');
    const mine = await createRequest(borrower.id, typeA.id);
    await createRequest(other.id, typeA.id);
    await createRequest(borrower.id, typeB.id);
    const copy1 = await createCopy(typeA.id, 'L-1');
    const copy2 = await createCopy(typeA.id, 'L-2');
    const copyB = await createCopy(typeB.id, 'L-B');
    for (const [copy, who] of [
      [copy1, borrower],
      [copy2, other],
      [copyB, borrower],
    ] as const) {
      const fulfilled = await createRequest(who.id, copy.equipmentTypeId, 'FULFILLED');
      await prisma.loan.create({
        data: {
          requestId: fulfilled.id,
          copyId: copy.id,
          borrowerId: who.id,
          checkedOutById: custodian.id,
          checkedOutAt: new Date('2026-11-03T03:00:00.000Z'),
          dueDate: new Date('2026-11-13T00:00:00.000Z'),
          status: 'ACTIVE',
        },
      });
    }
    const cookie = await signIn(app, custodian);
    const requests = (query: string) =>
      request(app).get(`/api/custodian/requests${query}`).set('Cookie', cookie);
    const loans = (query: string) =>
      request(app).get(`/api/custodian/loans${query}`).set('Cookie', cookie);
    const borrowers = (body: { items: { borrower: { id: number } }[] }) =>
      body.items.map((i) => i.borrower.id).sort();

    expect((await requests('')).body.items).toHaveLength(2);
    expect(borrowers((await requests(`?borrowerId=${borrower.id}`)).body)).toEqual([borrower.id]);
    expect((await requests(`?borrowerId=${borrower.id}`)).body.items[0].id).toBe(mine.id);
    expect((await requests(`?labId=${labA.id}&status=PENDING`)).body.items).toHaveLength(2);
    expect((await requests(`?labId=${labB.id}`)).body.items).toEqual([]);

    expect((await loans('')).body.items).toHaveLength(2);
    expect(borrowers((await loans(`?borrowerId=${other.id}`)).body)).toEqual([other.id]);
    expect((await loans(`?borrowerId=${borrower.id}&labId=${labA.id}`)).body.items).toHaveLength(1);
    expect((await loans(`?labId=${labB.id}`)).body.items).toEqual([]);
    expect((await loans(`?borrowerId=99999`)).body.items).toEqual([]);
  });
});

describe('TEST-F17-04 bad filters are refused (AC-F17-04, SR-02)', () => {
  it('returns 400 VALIDATION_ERROR with fields', async () => {
    const { app, custodian, borrower } = await setUp();
    const borrowerCookie = await signIn(app, borrower);
    const custodianCookie = await signIn(app, custodian);

    const cases: [string, string, string, string][] = [
      ['/api/equipment-types', '?labId=abc', 'labId', 'b'],
      ['/api/equipment-types', '?labId=0', 'labId', 'b'],
      ['/api/equipment-types', '?available=maybe', 'available', 'b'],
      ['/api/equipment-types', '?available=false', 'available', 'b'],
      ['/api/equipment-types', '?q=', 'q', 'b'],
      ['/api/equipment-types', `?q=${'x'.repeat(101)}`, 'q', 'b'],
      ['/api/equipment-types', '?category=', 'category', 'b'],
      ['/api/equipment-types', '?q=a&q=b', 'q', 'b'],
      ['/api/equipment-types', '?x=1', 'x', 'b'],
      ['/api/custodian/requests', '?borrowerId=1.5', 'borrowerId', 'c'],
      ['/api/custodian/requests', '?labId=-1', 'labId', 'c'],
      ['/api/custodian/requests', '?status=FULFILLED', 'status', 'c'],
      ['/api/custodian/requests', '?x=1', 'x', 'c'],
      ['/api/custodian/loans', '?borrowerId=abc', 'borrowerId', 'c'],
      ['/api/custodian/loans', '?labId=99999999999', 'labId', 'c'],
      ['/api/custodian/loans', '?x=1', 'x', 'c'],
    ];
    for (const [path, query, field, who] of cases) {
      const response = await request(app)
        .get(`${path}${query}`)
        .set('Cookie', who === 'b' ? borrowerCookie : custodianCookie);
      expect(response.status, `${path}${query}`).toBe(400);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(response.body.error.fields), `${path}${query}`).toContain(field);
    }
  });
});
