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
