import type { CopyStatus, PrismaClient, Role } from '@prisma/client';
import { hashPassword } from './auth/password.js';

// Synthetic seed data from SRS assumption A-04. Every person and asset tag here is invented (A-05).
// The seed only creates missing rows and never updates existing ones, apart from the smoke borrower's
// password hash, so it is safe on every deploy (SDS section 3.5, NFR-10). The sample On loan copy and
// its loan are added with F-05 (Sprint 2) through checkout, not by F-04 (SDS section 3.5).

export type SeedEnv = {
  SEED_USER_PASSWORD?: string;
  SMOKE_EMAIL?: string;
  SMOKE_PASSWORD?: string;
};

export type SeedSummary = { users: number; labs: number; types: number; copies: number };

const MIN_PASSWORD_LENGTH = 12;

const labs = ['Embedded Systems Lab', 'Network Lab'];

const users: { email: string; name: string; role: Role; lab?: string }[] = [
  {
    email: 'custodian.embedded@example.com',
    name: 'Napat Srisuk',
    role: 'CUSTODIAN',
    lab: labs[0],
  },
  { email: 'custodian.network@example.com', name: 'Kanya Meesuk', role: 'CUSTODIAN', lab: labs[1] },
  { email: 'borrower1@example.com', name: 'Arisa Kittipong', role: 'BORROWER' },
  { email: 'borrower2@example.com', name: 'Thanawat Chaiyo', role: 'BORROWER' },
  { email: 'borrower3@example.com', name: 'Pimchanok Rattana', role: 'BORROWER' },
];

const equipmentTypes: {
  lab: string;
  name: string;
  category: string;
  description: string;
  loanPeriodDays?: number;
  copies: [assetTag: string, status: CopyStatus][];
}[] = [
  {
    lab: labs[0],
    name: 'Arduino Uno R3',
    category: 'Development board',
    description: 'ATmega328P board with USB cable.',
    copies: [
      ['EMB-ARD-001', 'AVAILABLE'],
      ['EMB-ARD-002', 'AVAILABLE'],
      ['EMB-ARD-003', 'IN_MAINTENANCE'],
    ],
  },
  {
    lab: labs[0],
    name: 'Raspberry Pi 4',
    category: 'Development board',
    description: '4 GB model with power supply and 32 GB microSD card.',
    copies: [
      ['EMB-RPI-001', 'AVAILABLE'],
      ['EMB-RPI-002', 'AVAILABLE'],
    ],
  },
  {
    lab: labs[0],
    name: 'Digital oscilloscope',
    category: 'Test instrument',
    description: '2-channel 100 MHz oscilloscope with two probes.',
    loanPeriodDays: 3,
    copies: [
      ['EMB-OSC-001', 'AVAILABLE'],
      ['EMB-OSC-002', 'IN_MAINTENANCE'],
    ],
  },
  {
    lab: labs[0],
    name: 'Logic analyzer',
    category: 'Test instrument',
    description: '8-channel USB logic analyzer with test clips.',
    copies: [['EMB-LGA-001', 'AVAILABLE']],
  },
  {
    lab: labs[1],
    name: 'Managed switch',
    category: 'Networking',
    description: '8-port managed gigabit switch with console cable.',
    loanPeriodDays: 14,
    copies: [
      ['NET-SW-001', 'AVAILABLE'],
      ['NET-SW-002', 'AVAILABLE'],
    ],
  },
  {
    lab: labs[1],
    name: 'Laptop',
    category: 'Computer',
    description: '14-inch laptop with charger and lab software installed.',
    copies: [
      ['NET-LAP-001', 'AVAILABLE'],
      ['NET-LAP-002', 'AVAILABLE'],
      ['NET-LAP-003', 'IN_MAINTENANCE'],
    ],
  },
];

function requirePassword(name: string, value: string | undefined): string {
  if (!value || value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`${name} must be set to at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  // The .env.example placeholders start with "replace-". Refuse them so no account gets a public password.
  if (value.startsWith('replace-')) {
    throw new Error(`${name} still has the placeholder value from the example file.`);
  }
  return value;
}

export async function seed(
  prisma: PrismaClient,
  env: SeedEnv,
  now: Date = new Date(),
): Promise<SeedSummary> {
  // Check every input before writing anything.
  const seedPassword = requirePassword('SEED_USER_PASSWORD', env.SEED_USER_PASSWORD);
  if (Boolean(env.SMOKE_EMAIL) !== Boolean(env.SMOKE_PASSWORD)) {
    throw new Error('Set both SMOKE_EMAIL and SMOKE_PASSWORD, or neither.');
  }
  const smokeUser = env.SMOKE_EMAIL
    ? {
        email: env.SMOKE_EMAIL.toLowerCase(),
        password: requirePassword('SMOKE_PASSWORD', env.SMOKE_PASSWORD),
      }
    : undefined;
  if (smokeUser && users.some(({ email }) => email === smokeUser.email)) {
    throw new Error('SMOKE_EMAIL must not be one of the seeded demo accounts.');
  }

  // Every insert is one `INSERT ... ON CONFLICT DO NOTHING` (skipDuplicates), so a row that exists,
  // or that an overlapping run inserts first, is skipped instead of failing the run. The returned
  // count is the number of rows this run created.
  const created: SeedSummary = { users: 0, labs: 0, types: 0, copies: 0 };

  created.labs = (
    await prisma.lab.createMany({ data: labs.map((name) => ({ name })), skipDuplicates: true })
  ).count;
  const labIds = new Map(
    (await prisma.lab.findMany({ where: { name: { in: labs } } })).map(({ id, name }) => [
      name,
      id,
    ]),
  );

  const userRows = await Promise.all(
    users.map(async ({ email, name, role }) => ({
      email,
      name,
      role,
      passwordHash: await hashPassword(seedPassword),
      createdAt: now,
    })),
  );
  created.users = (await prisma.user.createMany({ data: userRows, skipDuplicates: true })).count;
  const userIds = new Map(
    (await prisma.user.findMany({ where: { email: { in: users.map(({ email }) => email) } } })).map(
      ({ id, email }) => [email, id],
    ),
  );
  await prisma.labAssignment.createMany({
    data: users
      .filter(({ lab }) => lab)
      .map(({ email, lab }) => ({ labId: labIds.get(lab!)!, custodianId: userIds.get(email)! })),
    skipDuplicates: true,
  });

  // The smoke borrower exists only for the deploy check, holds no business data, and is the one
  // row the seed updates: its hash follows SMOKE_PASSWORD so the secret can be rotated (SDS 3.5).
  if (smokeUser) {
    const passwordHash = await hashPassword(smokeUser.password);
    const inserted = await prisma.user.createMany({
      data: {
        email: smokeUser.email,
        name: 'Smoke Test Borrower',
        role: 'BORROWER',
        passwordHash,
        createdAt: now,
      },
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      await prisma.user.update({ where: { email: smokeUser.email }, data: { passwordHash } });
    }
    created.users += inserted.count;
  }

  created.types = (
    await prisma.equipmentType.createMany({
      data: equipmentTypes.map(({ lab, name, category, description, loanPeriodDays }) => ({
        labId: labIds.get(lab)!,
        name,
        category,
        description,
        loanPeriodDays,
      })),
      skipDuplicates: true,
    })
  ).count;
  const typeIds = new Map(
    (await prisma.equipmentType.findMany({ where: { labId: { in: [...labIds.values()] } } })).map(
      ({ id, labId, name }) => [`${labId}:${name}`, id],
    ),
  );

  created.copies = (
    await prisma.copy.createMany({
      data: equipmentTypes.flatMap(({ lab, name, copies }) =>
        copies.map(([assetTag, status]) => ({
          equipmentTypeId: typeIds.get(`${labIds.get(lab)}:${name}`)!,
          assetTag,
          status,
        })),
      ),
      skipDuplicates: true,
    })
  ).count;

  return created;
}
