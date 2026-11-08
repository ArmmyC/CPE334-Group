import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordStatusChange } from '../src/history/service.js';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import { clockStart, fixedClock, MINUTE } from './helpers/app.js';
import {
  createCopy,
  createEquipmentType,
  createLab,
  createLoan,
  createRequest,
  createUser,
} from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// A request, a copy, and a loan in one lab, with the people who act on them.
async function setUp() {
  const borrower = await createUser();
  const custodian = await createUser('CUSTODIAN');
  const lab = await createLab();
  const type = await createEquipmentType(lab.id);
  const copy = await createCopy(type.id);
  const request = await createRequest(borrower.id, type.id, 'FULFILLED');
  const loan = await createLoan(request.id, copy.id, borrower.id, custodian.id);
  const pending = await createRequest(borrower.id, type.id);
  return { borrower, custodian, lab, type, copy, request, loan, pending };
}

class Refused extends Error {}

describe('TEST-F07-01 one history entry for each status change (AC-F07-01)', () => {
  it('stores actor, old status, new status, lab, and clock time for a request, a loan, and a copy', async () => {
    const { borrower, custodian, lab, copy, loan, pending } = await setUp();
    const clock = fixedClock();

    await prisma.$transaction(async (tx) => {
      await tx.borrowRequest.updateMany({
        where: { id: pending.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await recordStatusChange(tx, clock, {
        entityType: 'REQUEST',
        entityId: pending.id,
        actorId: borrower.id,
        oldStatus: 'PENDING',
        newStatus: 'CANCELLED',
      });
    });
    await prisma.$transaction(async (tx) => {
      await tx.loan.updateMany({
        where: { id: loan.id, status: 'ACTIVE' },
        data: { status: 'RETURNED' },
      });
      await recordStatusChange(tx, clock, {
        entityType: 'LOAN',
        entityId: loan.id,
        actorId: custodian.id,
        oldStatus: 'ACTIVE',
        newStatus: 'RETURNED',
      });
    });
    await prisma.$transaction(async (tx) => {
      await tx.copy.updateMany({
        where: { id: copy.id, status: 'AVAILABLE' },
        data: { status: 'IN_MAINTENANCE' },
      });
      await recordStatusChange(tx, clock, {
        entityType: 'COPY',
        entityId: copy.id,
        actorId: custodian.id,
        oldStatus: 'AVAILABLE',
        newStatus: 'IN_MAINTENANCE',
      });
    });

    const rows = await prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      entityType: 'REQUEST',
      entityId: pending.id,
      labId: lab.id,
      oldStatus: 'PENDING',
      newStatus: 'CANCELLED',
      actorId: borrower.id,
      createdAt: clockStart,
    });
    expect(rows[1]).toMatchObject({
      entityType: 'LOAN',
      entityId: loan.id,
      labId: lab.id,
      oldStatus: 'ACTIVE',
      newStatus: 'RETURNED',
      actorId: custodian.id,
      createdAt: clockStart,
    });
    expect(rows[2]).toMatchObject({
      entityType: 'COPY',
      entityId: copy.id,
      labId: lab.id,
      oldStatus: 'AVAILABLE',
      newStatus: 'IN_MAINTENANCE',
      actorId: custodian.id,
      createdAt: clockStart,
    });
  });
});

describe('TEST-F07-02 a refused change stores no entry (AC-F07-02)', () => {
  it('rolls the entry back when the caller throws after recording', async () => {
    const { custodian, copy } = await setUp();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.copy.updateMany({
          where: { id: copy.id, status: 'AVAILABLE' },
          data: { status: 'IN_MAINTENANCE' },
        });
        await recordStatusChange(tx, fixedClock(), {
          entityType: 'COPY',
          entityId: copy.id,
          actorId: custodian.id,
          oldStatus: 'AVAILABLE',
          newStatus: 'IN_MAINTENANCE',
        });
        throw new Refused('a later step refused the change');
      }),
    ).rejects.toBeInstanceOf(Refused);

    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'AVAILABLE',
    );
    expect(await prisma.statusHistory.count()).toBe(0);
  });

  it('records nothing when the conditional update changes no row', async () => {
    const { custodian, copy } = await setUp();
    await prisma.copy.update({ where: { id: copy.id }, data: { status: 'ON_LOAN' } });

    await expect(
      prisma.$transaction(async (tx) => {
        const changed = await tx.copy.updateMany({
          where: { id: copy.id, status: 'AVAILABLE' },
          data: { status: 'IN_MAINTENANCE' },
        });
        if (changed.count === 0) {
          throw new Refused('the copy is not available');
        }
        await recordStatusChange(tx, fixedClock(), {
          entityType: 'COPY',
          entityId: copy.id,
          actorId: custodian.id,
          oldStatus: 'AVAILABLE',
          newStatus: 'IN_MAINTENANCE',
        });
      }),
    ).rejects.toBeInstanceOf(Refused);

    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'ON_LOAN',
    );
    expect(await prisma.statusHistory.count()).toBe(0);
  });
});

describe('F-07 supporting checks', () => {
  it('stores a null old status for a record that was just created', async () => {
    const borrower = await createUser();
    const type = await createEquipmentType();

    const request = await prisma.$transaction(async (tx) => {
      const row = await tx.borrowRequest.create({
        data: {
          borrowerId: borrower.id,
          equipmentTypeId: type.id,
          status: 'PENDING',
          createdAt: clockStart,
        },
      });
      await recordStatusChange(tx, fixedClock(), {
        entityType: 'REQUEST',
        entityId: row.id,
        actorId: borrower.id,
        oldStatus: null,
        newStatus: 'PENDING',
      });
      return row;
    });

    const row = await prisma.statusHistory.findFirstOrThrow({ where: { entityId: request.id } });
    expect(row.oldStatus).toBeNull();
    expect(row.newStatus).toBe('PENDING');
  });

  it('records the request, the copy, and the loan of one checkout with one actor and time', async () => {
    const borrower = await createUser();
    const custodian = await createUser('CUSTODIAN');
    const type = await createEquipmentType();
    const copy = await createCopy(type.id);
    const request = await createRequest(borrower.id, type.id);
    const clock = fixedClock();

    await prisma.$transaction(async (tx) => {
      await tx.borrowRequest.update({ where: { id: request.id }, data: { status: 'FULFILLED' } });
      await recordStatusChange(tx, clock, {
        entityType: 'REQUEST',
        entityId: request.id,
        actorId: custodian.id,
        oldStatus: 'PENDING',
        newStatus: 'FULFILLED',
      });
      await tx.copy.update({ where: { id: copy.id }, data: { status: 'ON_LOAN' } });
      await recordStatusChange(tx, clock, {
        entityType: 'COPY',
        entityId: copy.id,
        actorId: custodian.id,
        oldStatus: 'AVAILABLE',
        newStatus: 'ON_LOAN',
      });
      const loan = await tx.loan.create({
        data: {
          requestId: request.id,
          copyId: copy.id,
          borrowerId: borrower.id,
          checkedOutById: custodian.id,
          checkedOutAt: clockStart,
          dueDate: new Date(Date.UTC(2026, 10, 13)),
          status: 'ACTIVE',
        },
      });
      await recordStatusChange(tx, clock, {
        entityType: 'LOAN',
        entityId: loan.id,
        actorId: custodian.id,
        oldStatus: null,
        newStatus: 'ACTIVE',
      });
    });

    const rows = await prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => row.entityType)).toEqual(['REQUEST', 'COPY', 'LOAN']);
    expect(new Set(rows.map((row) => row.actorId))).toEqual(new Set([custodian.id]));
    expect(new Set(rows.map((row) => row.createdAt.getTime()))).toEqual(
      new Set([clockStart.getTime()]),
    );
  });

  it('gives each record the lab of its own equipment type', async () => {
    const first = await setUp();
    const second = await setUp();
    const actorId = first.custodian.id;

    await prisma.$transaction(async (tx) => {
      const clock = fixedClock();
      await recordStatusChange(tx, clock, {
        entityType: 'REQUEST',
        entityId: second.pending.id,
        actorId,
        oldStatus: null,
        newStatus: 'PENDING',
      });
      await recordStatusChange(tx, clock, {
        entityType: 'LOAN',
        entityId: second.loan.id,
        actorId,
        oldStatus: null,
        newStatus: 'ACTIVE',
      });
      await recordStatusChange(tx, clock, {
        entityType: 'COPY',
        entityId: second.copy.id,
        actorId,
        oldStatus: null,
        newStatus: 'AVAILABLE',
      });
    });

    const rows = await prisma.statusHistory.findMany();
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.labId))).toEqual(new Set([second.lab.id]));
    expect(second.lab.id).not.toBe(first.lab.id);
  });

  it('throws for a record that does not exist and rolls the transaction back', async () => {
    const { custodian, copy } = await setUp();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.copy.update({ where: { id: copy.id }, data: { status: 'IN_MAINTENANCE' } });
        await recordStatusChange(tx, fixedClock(), {
          entityType: 'COPY',
          entityId: copy.id + 1000,
          actorId: custodian.id,
          oldStatus: 'AVAILABLE',
          newStatus: 'IN_MAINTENANCE',
        });
      }),
    ).rejects.toThrow();

    expect((await prisma.copy.findUniqueOrThrow({ where: { id: copy.id } })).status).toBe(
      'AVAILABLE',
    );
    expect(await prisma.statusHistory.count()).toBe(0);
  });

  it('reads the time from the clock, not from the system', async () => {
    const { custodian, copy } = await setUp();
    const clock = fixedClock();

    await prisma.$transaction(async (tx) => {
      await recordStatusChange(tx, clock, {
        entityType: 'COPY',
        entityId: copy.id,
        actorId: custodian.id,
        oldStatus: 'AVAILABLE',
        newStatus: 'IN_MAINTENANCE',
      });
    });
    clock.advance(5 * MINUTE);
    await prisma.$transaction(async (tx) => {
      await recordStatusChange(tx, clock, {
        entityType: 'COPY',
        entityId: copy.id,
        actorId: custodian.id,
        oldStatus: 'IN_MAINTENANCE',
        newStatus: 'AVAILABLE',
      });
    });

    const rows = await prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => row.createdAt.getTime())).toEqual([
      clockStart.getTime(),
      clockStart.getTime() + 5 * MINUTE,
    ]);
  });
});
