import { expect, test, type Page } from '@playwright/test';
import { e2ePassword, seededCustodian, seededNetworkCustodian } from './seed-data';

async function logIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(e2ePassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/custodian\/requests$/);
}

// The seed creates one sample loan through the checkout service: EMB-RPI-001 in the Embedded
// Systems Lab. The Embedded custodian is assigned to that lab, the Network custodian is not.
test('TEST-F05-01 and TEST-F05-02: a custodian sees the active loans of the assigned lab only (AC-F05-01, AC-F05-02)', async ({
  browser,
}) => {
  const embeddedPage = await (await browser.newContext()).newPage();
  await logIn(embeddedPage, seededCustodian.email);
  await embeddedPage.getByRole('link', { name: 'Active loans' }).click();
  await expect(embeddedPage).toHaveURL(/\/custodian\/loans$/);
  await expect(embeddedPage.getByRole('heading', { name: 'Active loans' })).toBeVisible();
  const row = embeddedPage.getByRole('row', { name: /EMB-RPI-001/ });
  await expect(row).toContainText('Raspberry Pi 4');
  await expect(row).toContainText('Embedded Systems Lab');

  const networkPage = await (await browser.newContext()).newPage();
  await logIn(networkPage, seededNetworkCustodian.email);
  await networkPage.getByRole('link', { name: 'Active loans' }).click();
  await expect(networkPage.getByRole('heading', { name: 'Active loans' })).toBeVisible();
  await expect(
    networkPage.getByText('No active loans in your labs.').or(networkPage.getByRole('table')),
  ).toBeVisible();
  await expect(networkPage.getByText('EMB-RPI-001')).toHaveCount(0);
});
