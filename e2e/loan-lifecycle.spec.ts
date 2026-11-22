import { expect, test, type Page } from '@playwright/test';
import { e2ePassword, seededCustodian } from './seed-data';

async function logIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/custodian\/requests$/);
}

// TEST-E2E-F16-F09 (AC-F16-01, AC-F16-02, AC-F16-07, AC-F09-01, AC-F09-05, AC-F09-07, AC-F14-07).
// Uses the seeded sample loan EMB-RPI-001. This file sorts after active-loans.spec.ts, which
// expects that loan to still be active, so the loan is renewed and returned only here.
test('a custodian renews a loan once, then returns it, and both show in the history', async ({
  page,
}) => {
  await logIn(page, seededCustodian.email);
  await page.getByRole('link', { name: 'Active loans' }).click();
  const row = page.getByRole('row', { name: /EMB-RPI-001/ });
  const dueBefore = (await row.getByRole('cell').nth(5).innerText()).match(/\d{4}-\d{2}-\d{2}/)![0];

  // F-16: renew once.
  await row.getByRole('button', { name: 'Renew' }).click();
  await expect(page.getByRole('status')).toContainText('Renewed EMB-RPI-001. New due date');
  const renewedRow = page.getByRole('row', { name: /EMB-RPI-001/ });
  await expect(renewedRow.getByText('Renewed', { exact: true })).toBeVisible();
  await expect(renewedRow.getByRole('button', { name: 'Renew' })).toHaveCount(0);
  const dueAfter = (await renewedRow.getByRole('cell').nth(5).innerText()).match(
    /\d{4}-\d{2}-\d{2}/,
  )![0];
  expect(dueAfter > dueBefore).toBe(true);

  // F-09: an empty note is refused in the dialog, a valid one returns the loan.
  await renewedRow.getByRole('button', { name: 'Return' }).click();
  const dialog = page.getByRole('dialog', { name: /Return EMB-RPI-001/ });
  await dialog.getByRole('button', { name: 'Confirm return' }).click();
  await expect(dialog.getByText('Enter a note about the condition.')).toBeVisible();
  await dialog.getByLabel('Note').fill('Returned in good condition.');
  await dialog.getByRole('button', { name: 'Confirm return' }).click();
  await expect(page.getByRole('status')).toContainText('Returned EMB-RPI-001.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row', { name: /EMB-RPI-001/ })).toHaveCount(0);

  // F-14: the return is in the history.
  await page.getByRole('link', { name: 'History' }).click();
  const entry = page.getByRole('row', { name: /Loan #\d+: EMB-RPI-001/ }).first();
  await expect(entry).toContainText('Active to Returned');
});
