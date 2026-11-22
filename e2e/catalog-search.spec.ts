import { expect, test } from '@playwright/test';
import { e2ePassword, seededBorrower, seededEquipmentTypeName } from './seed-data';

// TEST-E2E-F17 (AC-F17-05). Reads only. A search with no match shows the empty sentence, and
// Clear filters brings the list back.
test('a borrower searches the catalog, gets no match, and clears the filters', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(seededBorrower.email);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole('link', { name: seededEquipmentTypeName })).toBeVisible();

  await page.getByLabel('Search').fill('arduino');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: seededEquipmentTypeName })).toBeVisible();

  await page.getByLabel('Search').fill('no-such-equipment-xyz');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Nothing matches these filters.')).toBeVisible();
  await expect(page.getByRole('link', { name: seededEquipmentTypeName })).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('link', { name: seededEquipmentTypeName })).toBeVisible();
  await expect(page.getByLabel('Search')).toHaveValue('');
});
