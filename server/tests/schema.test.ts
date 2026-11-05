import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import {
  createCopy,
  createEquipmentType,
  createLab,
  createLoan,
  createRequest,
  createUser,
  fixtureTime,
} from './helpers/fixtures.js';

const uniqueViolation = { code: 'P2002' };
const checkViolation = /check constraint/i;

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('TEST-SR03-01 unique asset tags (AC-SR03-01, BR-12)', () => {
  it('refuses a second copy with an existing asset tag', async () => {
    const type = await createEquipmentType();
    const otherType = await createEquipmentType();
    await createCopy(type.id, 'EMB-0001');

    await expect(createCopy(type.id, 'EMB-0001')).rejects.toMatchObject(uniqueViolation);
    await expect(createCopy(otherType.id, 'EMB-0001')).rejects.toMatchObject(uniqueViolation);
    expect(await prisma.copy.count({ where: { assetTag: 'EMB-0001' } })).toBe(1);
  });
});

describe('TEST-SR03-02 loan period range (AC-SR03-02, BR-05)', () => {
  function createType(labId: number, loanPeriodDays?: number) {
    return prisma.equipmentType.create({
      data: {
        labId,
        name: `Period ${loanPeriodDays ?? 'default'}`,
        category: 'Boards',
        description: 'Loan period check',
        loanPeriodDays,
      },
    });
  }

  it('accepts the boundaries 1 and 30 days', async () => {
    const lab = await createLab();

    expect((await createType(lab.id, 1)).loanPeriodDays).toBe(1);
    expect((await createType(lab.id, 30)).loanPeriodDays).toBe(30);
  });

  it.each([0, 31])('refuses %i days and stores nothing', async (days) => {
    const lab = await createLab();

    await expect(createType(lab.id, days)).rejects.toThrow(checkViolation);
    expect(await prisma.equipmentType.count()).toBe(0);
  });

  it('sets 7 days when no loan period is given', async () => {
    const lab = await createLab();

    expect((await createType(lab.id)).loanPeriodDays).toBe(7);
  });
});

describe('TEST-SR03-04 database guards for BR-01 and BR-04 (AC-SR03-04)', () => {
  it('refuses a second active loan for one copy until the first is returned', async () => {
    const borrower = await createUser();
    const otherBorrower = await createUser();
    const custodian = await createUser('CUSTODIAN');
    const type = await createEquipmentType();
    const copy = await createCopy(type.id);
    const first = await createRequest(borrower.id, type.id, 'FULFILLED');
    const second = await createRequest(otherBorrower.id, type.id, 'FULFILLED');
    const firstLoan = await createLoan(first.id, copy.id, borrower.id, custodian.id);

    await expect(
      createLoan(second.id, copy.id, otherBorrower.id, custodian.id),
    ).rejects.toMatchObject(uniqueViolation);

    await prisma.loan.update({
      where: { id: firstLoan.id },
      data: { status: 'RETURNED' },
    });
    await expect(
      createLoan(second.id, copy.id, otherBorrower.id, custodian.id),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('refuses a second Pending request for one borrower and type until the first leaves Pending', async () => {
    const borrower = await createUser();
    const otherBorrower = await createUser();
    const type = await createEquipmentType();
    const otherType = await createEquipmentType();
    const first = await createRequest(borrower.id, type.id);

    await expect(createRequest(borrower.id, type.id)).rejects.toMatchObject(uniqueViolation);
    await expect(createRequest(borrower.id, otherType.id)).resolves.toBeDefined();
    await expect(createRequest(otherBorrower.id, type.id)).resolves.toBeDefined();

    await prisma.borrowRequest.update({
      where: { id: first.id },
      data: { status: 'CANCELLED', decidedAt: fixtureTime },
    });
    await expect(createRequest(borrower.id, type.id)).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('refuses a second loan for the same request', async () => {
    const borrower = await createUser();
    const custodian = await createUser('CUSTODIAN');
    const type = await createEquipmentType();
    const copy = await createCopy(type.id);
    const otherCopy = await createCopy(type.id);
    const request = await createRequest(borrower.id, type.id, 'FULFILLED');
    await createLoan(request.id, copy.id, borrower.id, custodian.id);

    await expect(
      createLoan(request.id, otherCopy.id, borrower.id, custodian.id),
    ).rejects.toMatchObject(uniqueViolation);
  });
});

describe('Supporting check: lower-case email', () => {
  it('refuses an email with upper-case letters', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: 'Mixed@Example.test',
          name: 'Mixed Case',
          role: 'BORROWER',
          passwordHash: 'scrypt$16384$8$1$fixture$fixture',
          createdAt: fixtureTime,
        },
      }),
    ).rejects.toThrow(checkViolation);
  });
});
