import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import type { CopyStatus } from '@prisma/client';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { createAccount, createTestApp, logIn, sessionCookie } from './helpers/app.js';
import { createCopy, createLoan, createRequest } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type App = ReturnType<typeof createTestApp>;

async function signIn(app: App, role: 'BORROWER' | 'CUSTODIAN' = 'BORROWER') {
  const user = await createAccount(role);
  const cookie = sessionCookie(await logIn(app, user.email));
  if (!cookie) throw new Error('Login did not set a cookie.');
  return { user, cookie };
}

function get(app: App, cookie: string, path: string) {
  return request(app).get(path).set('Cookie', cookie);
}

async function createLab(name: string) {
  return prisma.lab.create({ data: { name } });
}

async function createType(labId: number, name: string, extra: { loanPeriodDays?: number } = {}) {
  return prisma.equipmentType.create({
    data: {
      labId,
      name,
      category: 'Boards',
      description: `${name} description`,
      ...extra,
    },
  });
}

let tagCounter = 0;
async function addCopies(typeId: number, status: CopyStatus, count: number) {
  for (let i = 0; i < count; i += 1) {
    tagCounter += 1;
    await prisma.copy.create({
      data: { equipmentTypeId: typeId, assetTag: `CAT-${tagCounter}`, status },
    });
  }
}

// Lab A has A1 with every copy status and A2 with only an On loan copy. Lab B has B1.
async function seedCatalog() {
  const labA = await createLab('Alpha Lab');
  const labB = await createLab('Beta Lab');
  const a1 = await createType(labA.id, 'A1 Arduino', { loanPeriodDays: 14 });
  const a2 = await createType(labA.id, 'A2 Scope');
  const b1 = await createType(labB.id, 'B1 Switch');
  await addCopies(a1.id, 'AVAILABLE', 2);
  await addCopies(a1.id, 'ON_LOAN', 1);
  await addCopies(a1.id, 'IN_MAINTENANCE', 1);
  await addCopies(a1.id, 'RETIRED', 1);
  await addCopies(a2.id, 'ON_LOAN', 1);
  await addCopies(b1.id, 'AVAILABLE', 1);
  return { labA, labB, a1, a2, b1 };
}

describe('TEST-F02-01 catalog grouped by lab with Available counts (AC-F02-01, FR-04)', () => {
  it('lists the types by lab and counts only Available copies', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app);
    const { labA, labB, a1, a2, b1 } = await seedCatalog();

    const response = await get(app, cookie, '/api/equipment-types');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        {
          lab: { id: labA.id, name: 'Alpha Lab' },
          equipmentTypes: [
            { id: a1.id, name: 'A1 Arduino', category: 'Boards', availableCount: 2 },
            { id: a2.id, name: 'A2 Scope', category: 'Boards', availableCount: 0 },
          ],
        },
        {
          lab: { id: labB.id, name: 'Beta Lab' },
          equipmentTypes: [{ id: b1.id, name: 'B1 Switch', category: 'Boards', availableCount: 1 }],
        },
      ],
    });
  });
});

describe('TEST-F02-02 type detail (AC-F02-02, FR-05)', () => {
  it('returns the description, lab, loan period, and Available count', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app);
    const { labA, a1 } = await seedCatalog();

    const response = await get(app, cookie, `/api/equipment-types/${a1.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: a1.id,
      name: 'A1 Arduino',
      category: 'Boards',
      description: 'A1 Arduino description',
      loanPeriodDays: 14,
      lab: { id: labA.id, name: 'Alpha Lab' },
      availableCount: 2,
    });
  });
});

// Collects every key name at every level of a JSON value.
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...allKeys(inner)]);
  }
  return [];
}

describe('TEST-F02-03 no borrower, loan, or holder data (AC-F02-03, BR-16)', () => {
  it('returns only catalog keys even when the type has a loan and a request', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app);
    const custodian = await createAccount('CUSTODIAN');
    const holder = await createAccount('BORROWER');
    const { labA, a1 } = await seedCatalog();
    await prisma.labAssignment.create({ data: { labId: labA.id, custodianId: custodian.id } });
    const copy = await createCopy(a1.id, 'HELD-TAG-9');
    await prisma.copy.update({ where: { id: copy.id }, data: { status: 'ON_LOAN' } });
    const fulfilled = await createRequest(holder.id, a1.id, 'FULFILLED');
    await createLoan(fulfilled.id, copy.id, holder.id, custodian.id);
    const other = await createAccount('BORROWER');
    await createRequest(other.id, a1.id, 'PENDING');

    const list = await get(app, cookie, '/api/equipment-types');
    const detail = await get(app, cookie, `/api/equipment-types/${a1.id}`);

    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    expect([...new Set(allKeys(list.body))].sort()).toEqual([
      'availableCount',
      'category',
      'equipmentTypes',
      'id',
      'items',
      'lab',
      'name',
    ]);
    expect([...new Set(allKeys(detail.body))].sort()).toEqual([
      'availableCount',
      'category',
      'description',
      'id',
      'lab',
      'loanPeriodDays',
      'name',
    ]);
    for (const text of [JSON.stringify(list.body), JSON.stringify(detail.body)]) {
      for (const secret of [holder.name, holder.email, other.name, other.email, 'HELD-TAG-9']) {
        expect(text).not.toContain(secret);
      }
    }
  });
});

describe('Supporting check: live count', () => {
  it('follows copy status changes and new copies', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app);
    const { a1 } = await seedCatalog();
    const count = async () =>
      (await get(app, cookie, `/api/equipment-types/${a1.id}`)).body.availableCount;

    expect(await count()).toBe(2);
    const available = await prisma.copy.findFirstOrThrow({
      where: { equipmentTypeId: a1.id, status: 'AVAILABLE' },
    });
    await prisma.copy.update({ where: { id: available.id }, data: { status: 'ON_LOAN' } });
    expect(await count()).toBe(1);
    await prisma.copy.update({ where: { id: available.id }, data: { status: 'AVAILABLE' } });
    await addCopies(a1.id, 'AVAILABLE', 1);
    expect(await count()).toBe(3);
  });
});

describe('Supporting check: sort order, empty catalog, and labs without types', () => {
  it('sorts labs and types by name', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app);
    const zulu = await createLab('Zulu Lab');
    const alpha = await createLab('Alpha Lab');
    await createType(zulu.id, 'Zeta');
    await createType(zulu.id, 'Alef');
    await createType(alpha.id, 'Mid');

    const { body } = await get(app, cookie, '/api/equipment-types');

    expect(body.items.map((item: { lab: { name: string } }) => item.lab.name)).toEqual([
      'Alpha Lab',
      'Zulu Lab',
    ]);
    expect(body.items[1].equipmentTypes.map((type: { name: string }) => type.name)).toEqual([
      'Alef',
      'Zeta',
    ]);
  });

  it('returns an empty list when there is no type, and skips a lab with no type', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app);
    await createLab('Empty Lab');

    const response = await get(app, cookie, '/api/equipment-types');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });
});

describe('Supporting check: wrong role (NFR-03)', () => {
  it('refuses a custodian on both endpoints with 403 FORBIDDEN', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app, 'CUSTODIAN');
    const { a1 } = await seedCatalog();

    for (const path of ['/api/equipment-types', `/api/equipment-types/${a1.id}`]) {
      const response = await get(app, cookie, path);

      expect(response.status).toBe(403);
      expect(apiErrorSchema.strict().parse(response.body)).toEqual({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this action.' },
      });
    }
  });

  it('refuses a request with no session with 401', async () => {
    const app = createTestApp();

    for (const path of ['/api/equipment-types', '/api/equipment-types/1']) {
      const response = await request(app).get(path);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('Supporting check: missing type', () => {
  it.each(['999999', '0', 'abc', '1.5', '-1', '99999999999'])(
    'returns 404 for id %s',
    async (id) => {
      const app = createTestApp();
      const { cookie } = await signIn(app);
      await seedCatalog();

      const response = await get(app, cookie, `/api/equipment-types/${id}`);

      expect(response.status).toBe(404);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
    },
  );
});

describe('Supporting check: unknown query parameter', () => {
  it('returns 400 VALIDATION_ERROR with the parameter name on both endpoints', async () => {
    const app = createTestApp();
    const { cookie } = await signIn(app);
    const { a1 } = await seedCatalog();

    for (const path of ['/api/equipment-types', `/api/equipment-types/${a1.id}`]) {
      const response = await get(app, cookie, `${path}?q=arduino`);

      expect(response.status).toBe(400);
      const { error } = apiErrorSchema.parse(response.body);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.fields).toHaveProperty('q');
    }
  });
});
