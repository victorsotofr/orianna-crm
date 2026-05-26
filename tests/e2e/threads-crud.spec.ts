import { expect, test } from '@playwright/test';

import { installMockOutreach } from './mock-outreach';

test('threads page supports search, rename, duplicate, archive, delete, and restore', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/threads');

  await expect(page.getByRole('heading', { name: /threads/i })).toBeVisible();
  await expect(page.getByText('Seeded active outreach')).toBeVisible();

  await page.getByPlaceholder(/Search threads/i).fill('seeded');
  await expect(page.getByText('Seeded active outreach')).toBeVisible();
  await page.getByPlaceholder(/Search threads/i).fill('');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toMatch(/Thread name/i);
    await dialog.accept('Renamed outreach thread');
  });
  await page.getByRole('button', { name: /Thread actions/i }).first().click();
  await page.getByRole('menuitem', { name: /Rename/i }).click();
  await expect(page.getByRole('link', { name: /^Renamed outreach thread/i })).toBeVisible();

  await page.getByRole('button', { name: /Thread actions/i }).first().click();
  await page.getByRole('menuitem', { name: /Duplicate/i }).click();
  await expect(page).toHaveURL(/\/launch\?thread=thread-/);
  await expect(page.getByText(/Copy of Renamed outreach thread/i)).toBeVisible();

  await page.goto('/threads');
  await page.getByRole('button', { name: /Thread actions/i }).first().click();
  await page.getByRole('menuitem', { name: /Archive/i }).click();
  await expect(page.getByText('Thread archived')).toBeVisible();
  await page.getByRole('button', { name: /^Archived$/i }).click();
  await expect(page.getByRole('link', { name: /^Renamed outreach thread/i })).toBeVisible();

  await page.getByRole('button', { name: /Thread actions/i }).first().click();
  await page.getByRole('menuitem', { name: /Unarchive/i }).click();
  await page.getByRole('button', { name: /^Active$/i }).click();
  await expect(page.getByRole('link', { name: /^Renamed outreach thread/i })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Thread actions/i }).first().click();
  await page.getByRole('menuitem', { name: /Delete/i }).click();
  await page.getByRole('button', { name: /^Deleted$/i }).click();
  await expect(page.getByRole('link', { name: /^Renamed outreach thread/i })).toBeVisible();

  await page.getByRole('button', { name: /Thread actions/i }).first().click();
  await page.getByRole('menuitem', { name: /Restore/i }).click();
  await page.getByRole('button', { name: /^Active$/i }).click();
  await expect(page.getByRole('link', { name: /^Renamed outreach thread/i })).toBeVisible();
});
