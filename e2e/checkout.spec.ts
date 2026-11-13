import { expect, test, type Page } from '@playwright/test';
import { e2ePassword, seededBorrower, seededCustodian } from './seed-data';

async function logIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Log in' }).click();
}

// TEST-E2E-01 (AC-F03-01, AC-F04-02, AC-F03-04). The borrower submits the request through the
// form on the equipment detail page, the custodian checks it out, and the borrower sees the loan.
test('TEST-E2E-01 a borrower requests through the form, a custodian checks it out, and the borrower sees the loan', async ({
  browser,
}) => {
  // The first seeded type, Arduino Uno R3 in the Embedded Systems Lab, has Available copies.
  const borrowerPage = await (await browser.newContext()).newPage();
  await logIn(borrowerPage, seededBorrower.email);
  await expect(borrowerPage).toHaveURL(/\/catalog$/);
  await borrowerPage.getByRole('link', { name: 'Arduino Uno R3' }).click();
  await borrowerPage.getByLabel('Purpose (optional)').fill('E2E checkout');
  await borrowerPage.getByRole('button', { name: 'Submit request' }).click();
  await expect(
    borrowerPage.getByRole('status').filter({ hasText: 'Request submitted.' }),
  ).toBeVisible();

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

  await borrowerPage.goto('/my');
  const loanRow = borrowerPage.getByRole('row', { name: /EMB-ARD-001/ });
  await expect(loanRow).toContainText('Arduino Uno R3');
  await expect(loanRow).toContainText('Active');
  await expect(loanRow).toContainText(/\d{4}-\d{2}-\d{2}/);
});
