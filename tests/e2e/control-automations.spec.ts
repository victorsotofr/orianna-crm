import { expect, test } from '@playwright/test';

import { installMockOutreach } from './mock-outreach';

test('control page stays lean and shows actionable queue state', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/outbound');

  await expect(page.getByRole('heading', { name: /isimple outreach control/i })).toBeVisible();
  await expect(page.getByText('Prospects need enrichment')).toBeVisible();
  await expect(page.getByText("Today's queue")).toHaveCount(1);
  await expect(page.getByText('Anne Christine Humeau')).toBeVisible();
  await expect(page.getByText('No email').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Enrich visible/i })).toBeVisible();
});

test('automations page lists recurring outreach workflows', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/automations');

  await expect(page.getByRole('heading', { name: /Automations/i })).toBeVisible();
  await expect(page.getByText('Recurring outreach workflows created from launch threads.')).toBeVisible();
  await expect(page.getByText('Lyon property managers')).toBeVisible();
  await expect(page.getByText('Find property managers in Lyon every morning')).toBeVisible();
});

test('sidebar navigation exposes Launch, Threads, Control, Automations, People, and Inbox', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');

  await expect(page.getByRole('link', { name: /Launch/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Threads/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Control/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Automations/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /People/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Inbox/i })).toBeVisible();
});
