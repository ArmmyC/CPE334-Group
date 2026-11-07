import { expect, test } from '@playwright/test';

test('login page reaches the API and the test database', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    'System status: API and database are reachable.',
  );
});
