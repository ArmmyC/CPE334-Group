import { expect, test, type Page } from '@playwright/test';
import { e2ePassword, seededBorrower, seededCustodian } from './seed-data';

async function logIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Log in' }).click();
}

// TEST-E2E-01 (AC-F03-01, AC-F04-02, AC-F03-04). The request form is F-02 and is not in this
// branch, so the borrower submits the request through the F-03 API. The custodian checkout and
// the borrower's loan list run in the browser. Add the form step when F-02 merges.
test('TEST-E2E-01 a custodian checks out a request and the borrower sees the loan', async ({
  browser,
  request,
}) => {
  // The first seeded type, Arduino Uno R3 in the Embedded Systems Lab, has Available copies.
  const login = await request.post('/api/auth/login', {
    data: { email: seededBorrower.email, password: e2ePassword },
  });
  expect(login.ok()).toBe(true);
  const created = await request.post('/api/requests', {
    data: { equipmentTypeId: 1, purpose: 'E2E checkout' },
  });
  expect(created.status()).toBe(201);

  const custodianPage = await (await browser.newContext()).newPage();
  await logIn(custodianPage, seededCustodian.email);
  await expect(custodianPage).toHaveURL(/\/custodian\/requests$/);
  await expect(custodianPage.getByRole('heading', { name: 'Pending requests' })).toBeVisible();
  const row = custodianPage.getByRole('row', { name: /Arisa Kittipong/ });
  await expect(row).toContainText('Arduino Uno R3');
  await expect(row).toContainText('E2E checkout');

  await row.getByRole('button', { name: 'Check out Arduino Uno R3' }).click();
  const dialog = custodianPage.getByRole('dialog', { name: 'Check out Arduino Uno R3' });
  await dialog.getByLabel('EMB-ARD-001').check();
  await dialog.getByRole('button', { name: 'Confirm checkout' }).click();

  await expect(custodianPage.getByRole('status')).toContainText(
    'Checked out EMB-ARD-001 to Arisa Kittipong.',
  );
  await expect(custodianPage.getByRole('dialog')).toHaveCount(0);
  await expect(custodianPage.getByRole('row', { name: /Arisa Kittipong/ })).toHaveCount(0);

  const borrowerPage = await (await browser.newContext()).newPage();
  await logIn(borrowerPage, seededBorrower.email);
  await expect(borrowerPage).toHaveURL(/\/catalog$/);
  await borrowerPage.goto('/my');
  const loanRow = borrowerPage.getByRole('row', { name: /EMB-ARD-001/ });
  await expect(loanRow).toContainText('Arduino Uno R3');
  await expect(loanRow).toContainText('Active');
  await expect(loanRow).toContainText(/\d{4}-\d{2}-\d{2}/);
});
