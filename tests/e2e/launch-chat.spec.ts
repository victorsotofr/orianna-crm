import { expect, test } from '@playwright/test';

import { installMockOutreach } from './mock-outreach';

function chatParagraph(page: import('@playwright/test').Page, text: string | RegExp) {
  return page.locator('p.whitespace-pre-line').filter({ hasText: text }).first();
}

async function submitEmptyComposer(page: import('@playwright/test').Page, text: string) {
  const composer = page.getByPlaceholder(/Ask about status, replies, automations/i);
  await composer.fill(text);
  await composer.press('Enter');
}

async function submitThreadMessage(page: import('@playwright/test').Page, text: string) {
  const composer = page.getByPlaceholder(/Ask the agent what to do next/i);
  await composer.fill(text);
  await composer.press('Enter');
}

test('direct chat message creates a thread, renders assistant reply, and survives refresh', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');

  await expect(page.getByRole('heading', { name: /new outreach/i })).toBeVisible();
  await submitEmptyComposer(page, 'ça va ?');

  await expect(page).toHaveURL(/\/launch\?thread=thread-/);
  await expect(chatParagraph(page, 'ça va ?')).toBeVisible();
  await expect(page.getByText(/spécialisé sur l.outreach/i)).toBeVisible();
  await expect(page.getByText(/Routing request/i)).toBeVisible();

  await page.reload();
  await expect(chatParagraph(page, 'ça va ?')).toBeVisible();
  await expect(page.getByText(/spécialisé sur l.outreach/i)).toBeVisible();
});

test('thread composer supports Shift+Enter and Enter submit', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');
  await submitEmptyComposer(page, 'hello');
  await expect(page.getByText(/spécialisé sur l.outreach/i)).toBeVisible();

  const composer = page.getByPlaceholder(/Ask the agent what to do next/i);
  await composer.fill('line one');
  await composer.press('Shift+Enter');
  await composer.type('line two');
  await expect(composer).toHaveValue('line one\nline two');

  await composer.press('Enter');
  await expect(chatParagraph(page, /line one[\s\S]*line two/)).toBeVisible();
});

test('workspace status, automations, inbox, and pipeline prompts render artifacts', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');

  await submitEmptyComposer(page, 'what needs my attention today?');
  await expect(page.getByText('Workspace status').first()).toBeVisible();
  await expect(page.getByText(/20 prospects need review/i).first()).toBeVisible();

  await submitThreadMessage(page, 'show my active automations');
  await expect(page.getByText('Automations').first()).toBeVisible();
  await expect(page.getByText(/1 active automation/i).first()).toBeVisible();

  await submitThreadMessage(page, 'any replies to answer?');
  await expect(page.getByText('Inbox attention').first()).toBeVisible();
  await expect(page.getByText(/conversation.*need a reply/i).first()).toBeVisible();

  await submitThreadMessage(page, 'what prospects need review?');
  await expect(page.getByText('Pipeline attention').first()).toBeVisible();
  await expect(page.getByText(/20 pending/i).first()).toBeVisible();
});

test('prospect search streams tool events and renders selectable prospects', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');

  await submitEmptyComposer(page, 'find 20 property managers in Lyon');

  await expect(page.getByText('Interpreting target')).toBeVisible();
  await expect(page.getByText('Validating candidates')).toBeVisible();
  await expect(page.getByText('Searching prospects')).toBeVisible();
  await expect(page.getByText('First prospect list').first()).toBeVisible();
  await expect(page.getByText('Claire Martin')).toBeVisible();
  await expect(page.getByText('Nicolas Bernard')).toBeVisible();
  await expect(page.getByRole('link', { name: /LinkedIn/i }).first()).toHaveAttribute('href', /linkedin\.com/);
  await expect(page.getByText(/2 selected/i).first()).toBeVisible();
});

test('off-domain chat is guarded and cannot contaminate the next prospect search', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');

  await submitEmptyComposer(page, 'ça va ?');
  await expect(page.getByText(/spécialisé sur l.outreach/i)).toBeVisible();

  await submitThreadMessage(page, 'qui est zidane ?');
  await expect(page.getByText(/spécialisé sur l.outreach/i).last()).toBeVisible();

  await submitThreadMessage(page, "multiplication d'hadamard");
  await expect(page.getByText(/spécialisé sur l.outreach/i).last()).toBeVisible();

  await submitThreadMessage(page, 'je veux trouver 25 gestionnaires locatifs région lyon indépendants si possible');
  await expect(page.getByText(/2 strict verified match\(es\) found out of 25/i).first()).toBeVisible();
  await expect(page.getByText('Claire Martin')).toBeVisible();
  await expect(page.getByText('Nicolas Bernard')).toBeVisible();
  await expect(page.getByText('Matthew J. Rowe')).toHaveCount(0);
  await expect(page.getByText('Yo Ça va')).toHaveCount(0);
});

test('sequence and confirmation flows are visible inside the chat', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');
  await submitEmptyComposer(page, 'find 20 property managers in Lyon');
  await expect(page.getByText('Claire Martin')).toBeVisible();

  await submitThreadMessage(page, 'draft the email sequence');
  await expect(page.getByText('Sequence drafted').first()).toBeVisible();
  await expect(page.getByText('Email 1 · 0d')).toBeVisible();

  await submitThreadMessage(page, 'launch sequence');
  await expect(page.getByText('Confirmation required').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible();
});

test('agent failure keeps user message and renders a failed assistant bubble', async ({ page }) => {
  const controls = await installMockOutreach(page);
  controls.failNextAgent();

  await page.goto('/launch');
  await submitEmptyComposer(page, 'ça va ?');

  await expect(chatParagraph(page, 'ça va ?')).toBeVisible();
  await expect(chatParagraph(page, 'Mock agent failure')).toBeVisible();
});
