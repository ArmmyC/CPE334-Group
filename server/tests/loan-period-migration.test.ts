import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import {
  createCopy,
  createLab,
  createLoan,
  createRequest,
  createUser,
} from './helpers/fixtures.js';

const CHECK = 'equipment_type_loan_period_days_check';
const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');

// CR-L7-01: the migration that lowers the maximum loan period. Its folder name ends with the
// slug below, so the test finds it without knowing the timestamp.
function migrationStatements(): string[] {
  const folder = readdirSync(migrationsDir).find((name) =>
    name.endsWith('_cr_l7_01_loan_period_max_14'),
  );
  if (!folder) throw new Error('migration folder *_cr_l7_01_loan_period_max_14 does not exist');
  const sql = readFileSync(join(migrationsDir, folder, 'migration.sql'), 'utf8');
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

// Puts the database back in the state before the migration: the old 1 to 30 check.
async function restoreOldCheck() {
  await prisma.$executeRawUnsafe(`ALTER TABLE equipment_type DROP CONSTRAINT IF EXISTS ${CHECK}`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE equipment_type ADD CONSTRAINT ${CHECK} CHECK (loan_period_days BETWEEN 1 AND 30)`,
  );
}

async function runMigration() {
  for (const statement of migrationStatements()) await prisma.$executeRawUnsafe(statement);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  // The migration leaves the database with the new check, which is the state every other test
  // file expects.
  await restoreOldCheck();
  await runMigration();
  await prisma.$disconnect();
});

describe('TEST-CR01-01 the migration lowers existing types above 14 (AC-CR01-01, BR-05)', () => {
  it('sets types of 15 to 30 days to 14, keeps 1 to 14, and then refuses 15', async () => {
    await restoreOldCheck();
    const lab = await createLab();
    const days = [1, 7, 14, 15, 21, 30];
    for (const loanPeriodDays of days) {
      await prisma.equipmentType.create({
        data: {
          labId: lab.id,
          name: `Period ${loanPeriodDays}`,
          category: 'Boards',
          description: 'Migration fixture',
          loanPeriodDays,
        },
      });
    }

    await runMigration();

    const types = await prisma.equipmentType.findMany({ orderBy: { id: 'asc' } });
    expect(types.map((type) => type.loanPeriodDays)).toEqual([1, 7, 14, 14, 14, 14]);
    await expect(
      prisma.equipmentType.create({
        data: {
          labId: lab.id,
          name: 'Too long',
          category: 'Boards',
          description: 'Refused by the new check',
          loanPeriodDays: 15,
        },
      }),
    ).rejects.toThrow(new RegExp(CHECK));
  });
});

describe('TEST-CR01-02 loans made before the change are untouched (AC-CR01-02)', () => {
  it('keeps the due date and the history of an active loan on a type that was lowered', async () => {
    await restoreOldCheck();
    const lab = await createLab();
    const type = await prisma.equipmentType.create({
      data: {
        labId: lab.id,
        name: 'Thirty days',
        category: 'Boards',
        description: 'Migration fixture',
        loanPeriodDays: 30,
      },
    });
    const borrower = await createUser('BORROWER');
    const custodian = await createUser('CUSTODIAN');
    const request = await createRequest(borrower.id, type.id, 'FULFILLED');
    const copy = await createCopy(type.id);
    const loan = await createLoan(request.id, copy.id, borrower.id, custodian.id);

    await runMigration();

    const after = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(after.dueDate).toEqual(loan.dueDate);
    expect(after.status).toBe('ACTIVE');
    expect(await prisma.equipmentType.findUniqueOrThrow({ where: { id: type.id } })).toMatchObject({
      loanPeriodDays: 14,
    });
  });
});
