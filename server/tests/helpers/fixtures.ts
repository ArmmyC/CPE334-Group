import { prisma } from '../../src/db.js';

// Fixed time for fixture timestamps. Columns have no database defaults (SDS section 8).
export const fixtureTime = new Date('2026-11-06T03:00:00.000Z');

let counter = 0;
function next(): number {
  counter += 1;
  return counter;
}

export function createUser(role: 'BORROWER' | 'CUSTODIAN' = 'BORROWER') {
  const n = next();
  return prisma.user.create({
    data: {
      email: `user${n}@example.test`,
      name: `User ${n}`,
      role,
      passwordHash: 'scrypt$16384$8$1$fixture$fixture',
      createdAt: fixtureTime,
    },
  });
}

export function createLab() {
  return prisma.lab.create({ data: { name: `Lab ${next()}` } });
}

export async function createEquipmentType(labId?: number) {
  const lab = labId ?? (await createLab()).id;
  return prisma.equipmentType.create({
    data: {
      labId: lab,
      name: `Type ${next()}`,
      category: 'Boards',
      description: 'Fixture equipment type',
    },
  });
}

export function createCopy(equipmentTypeId: number, assetTag = `TAG-${next()}`) {
  return prisma.copy.create({ data: { equipmentTypeId, assetTag, status: 'AVAILABLE' } });
}

export function createRequest(
  borrowerId: number,
  equipmentTypeId: number,
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED' = 'PENDING',
) {
  return prisma.borrowRequest.create({
    data: { borrowerId, equipmentTypeId, status, createdAt: fixtureTime },
  });
}

export function createLoan(
  requestId: number,
  copyId: number,
  borrowerId: number,
  checkedOutById: number,
) {
  return prisma.loan.create({
    data: {
      requestId,
      copyId,
      borrowerId,
      checkedOutById,
      checkedOutAt: fixtureTime,
      dueDate: new Date(Date.UTC(2026, 10, 13)),
      status: 'ACTIVE',
    },
  });
}
