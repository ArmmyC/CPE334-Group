import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDatabase } from './helpers/database.js';
import {
  createAccount,
  createTestApp,
  fixedClock,
  logIn,
  sessionCookie,
  testPassword,
} from './helpers/app.js';
import { createCopy, createEquipmentType } from './helpers/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type App = ReturnType<typeof createTestApp>;

async function signInBorrower(app: App) {
  const account = await createAccount('BORROWER');
  const cookie = sessionCookie(await logIn(app, account.email, testPassword))!;
  return { account, cookie };
}

const submit = (app: App, cookie: string, body: object) =>
  request(app).post('/api/requests').set('Cookie', cookie).send(body);

const cancel = (app: App, cookie: string, id: number) =>
  request(app).post(`/api/requests/${id}/cancel`).set('Cookie', cookie);

const historyRows = () => prisma.statusHistory.findMany({ orderBy: { id: 'asc' } });

// F-03 submit and cancel record history through F-07 (AC-F07-01, FR-17). These checks sit in
// their own file so the F-03 test file is not touched.
describe('F-03 records history through F-07 (AC-F07-01, AC-F07-02, FR-17)', () => {
  it('records the new request with a null old status and the borrower as actor', async () => {
    const clock = fixedClock(new Date('2026-11-08T03:00:00.000Z'));
    const app = createTestApp({ clock });
    const { account, cookie } = await signInBorrower(app);
    const type = await createEquipmentType();
    await createCopy(type.id);

    const response = await submit(app, cookie, { equipmentTypeId: type.id });

    expect(response.status).toBe(201);
    const rows = await historyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityType: 'REQUEST',
      entityId: response.body.id,
      labId: type.labId,
      oldStatus: null,
      newStatus: 'PENDING',
      actorId: account.id,
    });
    expect(rows[0].createdAt.toISOString()).toBe('2026-11-08T03:00:00.000Z');
  });

  it('records the cancel as Pending to Cancelled with the borrower as actor', async () => {
    const app = createTestApp();
    const { account, cookie } = await signInBorrower(app);
    const type = await createEquipmentType();
    await createCopy(type.id);
    const created = await submit(app, cookie, { equipmentTypeId: type.id });

    const response = await cancel(app, cookie, created.body.id);

    expect(response.status).toBe(200);
    const rows = await historyRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      entityType: 'REQUEST',
      entityId: created.body.id,
      labId: type.labId,
      oldStatus: 'PENDING',
      newStatus: 'CANCELLED',
      actorId: account.id,
    });
  });

  it('records nothing for a refused submit or a refused cancel', async () => {
    const app = createTestApp();
    const { cookie } = await signInBorrower(app);
    const noCopies = await createEquipmentType();
    const type = await createEquipmentType();
    await createCopy(type.id);
    const created = await submit(app, cookie, { equipmentTypeId: type.id });
    await cancel(app, cookie, created.body.id);
    const before = (await historyRows()).length;

    const noCopy = await submit(app, cookie, { equipmentTypeId: noCopies.id });
    const secondCancel = await cancel(app, cookie, created.body.id);

    expect(noCopy.status).toBe(409);
    expect(secondCancel.status).toBe(409);
    expect(await historyRows()).toHaveLength(before);
  });

  it('records nothing when a duplicate submit is refused', async () => {
    const app = createTestApp();
    const { cookie } = await signInBorrower(app);
    const type = await createEquipmentType();
    await createCopy(type.id);
    await submit(app, cookie, { equipmentTypeId: type.id });

    const duplicate = await submit(app, cookie, { equipmentTypeId: type.id });

    expect(duplicate.status).toBe(409);
    expect(await historyRows()).toHaveLength(1);
  });
});
