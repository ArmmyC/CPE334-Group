import { expect, test } from '@playwright/test';

test('home page reaches the API and the test database', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'CPE Lab Equipment Borrowing' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    'System status: API and database are reachable.',
  );
});
