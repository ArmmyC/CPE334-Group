import type { CopyStatus, PrismaClient, Role } from '@prisma/client';
import { hashPassword } from './auth/password.js';

// Synthetic seed data from SRS assumption A-04. Every person and asset tag here is invented (A-05).
// The seed only creates missing rows and never updates existing ones, so it is safe on every deploy
// (SDS section 3.5, NFR-10). The sample On loan copy and its loan are added by F-04 through checkout.

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

  const created: SeedSummary = { users: 0, labs: 0, types: 0, copies: 0 };

  const labIds = new Map<string, number>();
  for (const name of labs) {
    const existing = await prisma.lab.findUnique({ where: { name } });
    const lab = existing ?? (await prisma.lab.create({ data: { name } }));
    created.labs += existing ? 0 : 1;
    labIds.set(name, lab.id);
  }

  const people = users.map((user) => ({ ...user, password: seedPassword }));
  for (const person of people) {
    let user = await prisma.user.findUnique({ where: { email: person.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: person.email,
          name: person.name,
          role: person.role,
          passwordHash: await hashPassword(person.password),
          createdAt: now,
        },
      });
      created.users += 1;
    }
    if (person.lab) {
      const key = { labId: labIds.get(person.lab)!, custodianId: user.id };
      await prisma.labAssignment.upsert({
        where: { labId_custodianId: key },
        update: {},
        create: key,
      });
    }
  }

  // The smoke borrower exists only for the deploy check, holds no business data, and is the one
  // row the seed updates: its hash follows SMOKE_PASSWORD so the secret can be rotated (SDS 3.5).
  if (smokeUser) {
    const passwordHash = await hashPassword(smokeUser.password);
    const existing = await prisma.user.findUnique({ where: { email: smokeUser.email } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
    } else {
      await prisma.user.create({
        data: {
          email: smokeUser.email,
          name: 'Smoke Test Borrower',
          role: 'BORROWER',
          passwordHash,
          createdAt: now,
        },
      });
      created.users += 1;
    }
  }

  for (const type of equipmentTypes) {
    const labId = labIds.get(type.lab)!;
    let equipmentType = await prisma.equipmentType.findUnique({
      where: { labId_name: { labId, name: type.name } },
    });
    if (!equipmentType) {
      equipmentType = await prisma.equipmentType.create({
        data: {
          labId,
          name: type.name,
          category: type.category,
          description: type.description,
          loanPeriodDays: type.loanPeriodDays,
        },
      });
      created.types += 1;
    }
    for (const [assetTag, status] of type.copies) {
      const existing = await prisma.copy.findUnique({ where: { assetTag } });
      if (!existing) {
        await prisma.copy.create({ data: { equipmentTypeId: equipmentType.id, assetTag, status } });
        created.copies += 1;
      }
    }
  }

  return created;
}
