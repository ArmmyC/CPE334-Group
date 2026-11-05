import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { seed } from '../src/seed.js';
import { resetDatabase } from './helpers/database.js';

const seedEnv = { SEED_USER_PASSWORD: 'seed-password-for-tests' };

async function countRows() {
  return {
    users: await prisma.user.count(),
    labs: await prisma.lab.count(),
    assignments: await prisma.labAssignment.count(),
    types: await prisma.equipmentType.count(),
    copies: await prisma.copy.count(),
  };
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seed', () => {
  it('loads the A-04 catalog', async () => {
    await seed(prisma, seedEnv);

    expect(await countRows()).toEqual({
      users: 5,
      labs: 2,
      assignments: 2,
      types: 6,
      copies: expect.any(Number),
    });
    expect(await prisma.user.count({ where: { role: 'CUSTODIAN' } })).toBe(2);
    expect(await prisma.copy.count({ where: { status: 'AVAILABLE' } })).toBeGreaterThan(0);
    expect(await prisma.copy.count({ where: { status: 'IN_MAINTENANCE' } })).toBeGreaterThan(0);

    const custodianLabs = await prisma.labAssignment.findMany({ select: { labId: true } });
    expect(new Set(custodianLabs.map(({ labId }) => labId)).size).toBe(2);
  });

  it('is repeatable and never resets a changed copy status', async () => {
    await seed(prisma, seedEnv);
    const firstCounts = await countRows();
    const copy = await prisma.copy.findFirstOrThrow({ where: { status: 'AVAILABLE' } });
    await prisma.copy.update({ where: { id: copy.id }, data: { status: 'IN_MAINTENANCE' } });

    await seed(prisma, seedEnv);

    expect(await countRows()).toEqual(firstCounts);
    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'IN_MAINTENANCE',
    );
  });

  it('never stores the plain password', async () => {
    await seed(prisma, seedEnv);

    const users = await prisma.user.findMany({ select: { passwordHash: true } });
    for (const { passwordHash } of users) {
      expect(passwordHash).toMatch(/^scrypt\$16384\$8\$1\$/);
      expect(passwordHash).not.toContain(seedEnv.SEED_USER_PASSWORD);
    }
  });

  it.each([
    ['unset', {}],
    ['shorter than 12 characters', { SEED_USER_PASSWORD: 'short' }],
  ])('refuses a password that is %s and writes nothing', async (_label, env) => {
    await expect(seed(prisma, env)).rejects.toThrow(/SEED_USER_PASSWORD/);
    expect(await prisma.user.count()).toBe(0);
  });

  it('creates the smoke borrower only when both smoke variables are set', async () => {
    await seed(prisma, { ...seedEnv, SMOKE_EMAIL: 'smoke@example.test' });
    expect(await prisma.user.count({ where: { email: 'smoke@example.test' } })).toBe(0);

    await seed(prisma, {
      ...seedEnv,
      SMOKE_EMAIL: 'Smoke@Example.test',
      SMOKE_PASSWORD: 'smoke-password-for-tests',
    });
    const smoke = await prisma.user.findUniqueOrThrow({ where: { email: 'smoke@example.test' } });
    expect(smoke.role).toBe('BORROWER');
  });
});
