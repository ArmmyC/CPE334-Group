import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { seed, type SeedSummary } from '../src/seed.js';
import { resetDatabase } from './helpers/database.js';

const seedEnv = { SEED_USER_PASSWORD: 'seed-password-for-tests' };

async function countRows() {
  return {
    users: await prisma.user.count(),
    labs: await prisma.lab.count(),
    assignments: await prisma.labAssignment.count(),
    types: await prisma.equipmentType.count(),
    copies: await prisma.copy.count(),
    loans: await prisma.loan.count(),
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
      loans: 1,
    });
    expect(await prisma.user.count({ where: { role: 'CUSTODIAN' } })).toBe(2);
    expect(await prisma.copy.count({ where: { status: 'AVAILABLE' } })).toBeGreaterThan(0);
    expect(await prisma.copy.count({ where: { status: 'IN_MAINTENANCE' } })).toBeGreaterThan(0);

    const custodianLabs = await prisma.labAssignment.findMany({ select: { labId: true } });
    expect(new Set(custodianLabs.map(({ labId }) => labId)).size).toBe(2);
  });

  it('creates one sample loan through checkout, with its history, and never a second', async () => {
    const first = await seed(prisma, seedEnv);
    const second = await seed(prisma, seedEnv);

    expect([first.loans, second.loans]).toEqual([1, 0]);
    const loan = await prisma.loan.findFirstOrThrow({
      include: { copy: true, borrower: true, checkedOutBy: true, request: true },
    });
    expect(loan.status).toBe('ACTIVE');
    expect(loan.copy).toMatchObject({ assetTag: 'EMB-RPI-001', status: 'ON_LOAN' });
    expect(loan.borrower.email).toBe('borrower3@example.com');
    expect(loan.checkedOutBy.email).toBe('custodian.embedded@example.com');
    expect(loan.request.status).toBe('FULFILLED');

    // The request creation, then the three entries of the checkout, in order.
    const history = await prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });
    expect(
      history.map(({ entityType, entityId, oldStatus, newStatus, actorId }) => ({
        entityType,
        entityId,
        oldStatus,
        newStatus,
        actorId,
      })),
    ).toEqual([
      {
        entityType: 'REQUEST',
        entityId: loan.requestId,
        oldStatus: null,
        newStatus: 'PENDING',
        actorId: loan.borrowerId,
      },
      {
        entityType: 'REQUEST',
        entityId: loan.requestId,
        oldStatus: 'PENDING',
        newStatus: 'FULFILLED',
        actorId: loan.checkedOutById,
      },
      {
        entityType: 'COPY',
        entityId: loan.copyId,
        oldStatus: 'AVAILABLE',
        newStatus: 'ON_LOAN',
        actorId: loan.checkedOutById,
      },
      {
        entityType: 'LOAN',
        entityId: loan.id,
        oldStatus: null,
        newStatus: 'ACTIVE',
        actorId: loan.checkedOutById,
      },
    ]);
  });

  it('adds no sample loan when a loan exists or the sample copy is not Available', async () => {
    await seed(prisma, seedEnv);
    await prisma.loan.update({
      where: { requestId: (await prisma.loan.findFirstOrThrow()).requestId },
      data: { status: 'RETURNED' },
    });
    await prisma.copy.update({ where: { assetTag: 'EMB-RPI-001' }, data: { status: 'AVAILABLE' } });
    expect((await seed(prisma, seedEnv)).loans).toBe(0);
    expect(await prisma.loan.count()).toBe(1);

    await resetDatabase();
    await seed(prisma, seedEnv);
    await prisma.loan.deleteMany();
    await prisma.copy.update({
      where: { assetTag: 'EMB-RPI-001' },
      data: { status: 'IN_MAINTENANCE' },
    });
    expect((await seed(prisma, seedEnv)).loans).toBe(0);
    expect(await prisma.loan.count()).toBe(0);
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

  it('lets two overlapping runs finish and creates each row once', async () => {
    const env = {
      ...seedEnv,
      SMOKE_EMAIL: 'smoke@example.test',
      SMOKE_PASSWORD: 'smoke-password-for-tests',
    };

    // allSettled waits for both runs, so a failed run cannot keep writing into the next test.
    const results = await Promise.allSettled([seed(prisma, env), seed(prisma, env)]);
    expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
    const [first, second] = results.map(
      (result) => (result as PromiseFulfilledResult<SeedSummary>).value,
    );

    expect({
      users: first.users + second.users,
      labs: first.labs + second.labs,
      types: first.types + second.types,
      copies: first.copies + second.copies,
      loans: first.loans + second.loans,
    }).toEqual({ users: 6, labs: 2, types: 6, copies: 13, loans: 1 });
    expect(await countRows()).toEqual({
      users: 6,
      labs: 2,
      assignments: 2,
      types: 6,
      copies: 13,
      loans: 1,
    });
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
    ['an unset seed password', {}, /SEED_USER_PASSWORD/],
    ['a seed password under 12 characters', { SEED_USER_PASSWORD: 'short' }, /SEED_USER_PASSWORD/],
    [
      'the example placeholder',
      { SEED_USER_PASSWORD: 'replace-with-a-seed-password' },
      /SEED_USER_PASSWORD/,
    ],
    [
      'a smoke email without a password',
      { ...seedEnv, SMOKE_EMAIL: 'smoke@example.test' },
      /SMOKE/,
    ],
    [
      'a smoke password without an email',
      { ...seedEnv, SMOKE_PASSWORD: 'smoke-password-for-tests' },
      /SMOKE/,
    ],
    [
      'a smoke email that is a demo account',
      {
        ...seedEnv,
        SMOKE_EMAIL: 'Borrower1@example.com',
        SMOKE_PASSWORD: 'smoke-password-for-tests',
      },
      /SMOKE_EMAIL/,
    ],
  ])('refuses %s and writes nothing', async (_label, env, message) => {
    await expect(seed(prisma, env)).rejects.toThrow(message);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.lab.count()).toBe(0);
  });

  it('creates the smoke borrower when both smoke variables are set', async () => {
    await seed(prisma, seedEnv);
    expect(await prisma.user.count({ where: { email: 'smoke@example.test' } })).toBe(0);

    await seed(prisma, {
      ...seedEnv,
      SMOKE_EMAIL: 'Smoke@Example.test',
      SMOKE_PASSWORD: 'smoke-password-for-tests',
    });
    const smoke = await prisma.user.findUniqueOrThrow({ where: { email: 'smoke@example.test' } });
    expect(smoke.role).toBe('BORROWER');
    expect(await prisma.labAssignment.count({ where: { custodianId: smoke.id } })).toBe(0);
  });

  it('updates only the smoke password hash when SMOKE_PASSWORD changes', async () => {
    const smokeEnv = { ...seedEnv, SMOKE_EMAIL: 'smoke@example.test' };
    await seed(prisma, { ...smokeEnv, SMOKE_PASSWORD: 'first-smoke-password' });
    const before = await prisma.user.findUniqueOrThrow({ where: { email: 'smoke@example.test' } });
    const demo = await prisma.user.findUniqueOrThrow({ where: { email: 'borrower1@example.com' } });
    const counts = await countRows();

    await seed(prisma, { ...smokeEnv, SMOKE_PASSWORD: 'second-smoke-password' });

    const after = await prisma.user.findUniqueOrThrow({ where: { email: 'smoke@example.test' } });
    expect(after.id).toBe(before.id);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { email: 'borrower1@example.com' } }))
        .passwordHash,
    ).toBe(demo.passwordHash);
    expect(await countRows()).toEqual(counts);
  });
});
