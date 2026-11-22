import { expect, test, type Page } from '@playwright/test';
import { e2ePassword, seededCustodian } from './seed-data';

async function logIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/custodian\/requests$/);
}

// TEST-E2E-F18-F19 (AC-F18-05, AC-F19-06). Reads only, so it does not depend on whether another
// spec has already renewed or returned the seeded sample loan EMB-RPI-001.
test('a custodian opens the loan history of a copy and the inventory summary', async ({ page }) => {
  await logIn(page, seededCustodian.email);

  // F-18: the History link of a copy opens the loans of that copy.
  await page.getByRole('link', { name: 'Copies' }).click();
  await page.getByRole('link', { name: 'History of EMB-RPI-001' }).click();
  await expect(page.getByRole('heading', { name: 'Loan history of a copy' })).toBeVisible();
  await expect(page.getByRole('row', { name: /EMB-RPI-001/ }).first()).toBeVisible();

  // F-19: a card per assigned lab, and a range that is refused shows the server message.
  await page.getByRole('link', { name: 'Summary' }).click();
  await expect(page.getByRole('heading', { name: 'Inventory summary' })).toBeVisible();
  const card = page.getByRole('region').first();
  await expect(card.getByText(/^Available: \d+$/)).toBeVisible();
  await expect(card.getByText(/^Overdue loans: \d+$/)).toBeVisible();

  await page.getByLabel('From').fill('2026-11-05');
  await page.getByLabel('To').fill('2026-11-01');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('alert')).toContainText('From must be on or before To.');
});
