import { expect, test } from '@playwright/test';
import { e2ePassword, seededBorrower } from './seed-data';

// The borrower part of TEST-E2E-01. The custodian checkout part is in checkout.spec.ts (F-04).
test('TEST-E2E-01 borrower part: request a type, see it Pending, then cancel it (AC-F03-01, AC-F03-04, AC-F03-06)', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(seededBorrower.email);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/catalog$/);

  await page.getByRole('link', { name: 'Raspberry Pi 4' }).click();
  await expect(page.getByRole('heading', { name: 'Raspberry Pi 4' })).toBeVisible();

  await page.getByLabel('Purpose (optional)').fill('Embedded systems project');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Request submitted.' })).toBeVisible();

  await page.getByRole('link', { name: 'View My requests' }).click();
  await expect(page).toHaveURL(/\/my$/);
  const row = page.getByRole('row').filter({ hasText: 'Raspberry Pi 4' });
  await expect(row).toContainText('Embedded systems project');
  await expect(row).toContainText('Pending');

  await row.getByRole('button', { name: 'Cancel request for Raspberry Pi 4' }).click();
  await expect(row).toContainText('Cancelled');
  await expect(row.getByRole('button', { name: /Cancel request/ })).toHaveCount(0);
});
