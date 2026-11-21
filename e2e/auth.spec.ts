import { expect, test } from '@playwright/test';
import { e2ePassword, seededBorrower } from './seed-data';

test('TEST-E2E-02 log in, reload, and log out (AC-F01-01, AC-F01-03, AC-F01-04)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(seededBorrower.email);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Log in' }).click();

  const header = page.getByRole('banner');
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(header.getByText(seededBorrower.name)).toBeVisible();
  await expect(header.getByText('Borrower', { exact: true })).toBeVisible();

  await page.reload();
  await expect(header.getByText(seededBorrower.name)).toBeVisible();
  await expect(header.getByText('Borrower', { exact: true })).toBeVisible();

  await header.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();

  await page.goto('/catalog');
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong password shows the generic message (AC-F01-02)', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Email').fill(seededBorrower.email);
  await page.getByLabel('Password').fill('wrong-password-1');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page).toHaveURL(/\/login$/);
});

test('TEST-E2E-NG-F02 Back after logout shows no signed-in data (AC-F01-03, NFR-04)', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(seededBorrower.email);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/catalog$/);

  // A full page load of a signed-in page, so Back has a real document to restore.
  await page.goto('/my');
  const header = page.getByRole('banner');
  await expect(header.getByText(seededBorrower.name)).toBeVisible();

  await header.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Go Back through the history. No step may show the previous user's name or a
  // signed-in page; the app must end on the login page or leave this site's history.
  for (let step = 0; step < 3; step += 1) {
    await page.goBack({ waitUntil: 'load' }).catch(() => null);
    await expect(page.getByText(seededBorrower.name)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0);
  }

  await page.goto('/my');
  await expect(page).toHaveURL(/\/login$/);
});

test('TEST-E2E-NG-F02b API responses are never cacheable (NFR-04)', async ({ request }) => {
  // The E2E API server runs on port 4100. A signed-out call and a health call both carry
  // no-store, so a browser cannot keep signed-in data for Back to show after Logout.
  for (const path of ['/api/auth/me', '/api/health']) {
    const response = await request.get(`http://127.0.0.1:4100${path}`);
    expect(response.headers()['cache-control'], path).toContain('no-store');
  }
});
