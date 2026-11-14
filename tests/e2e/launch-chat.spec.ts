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
  await expect(page.getByText(/agent GTM isimple/i)).toBeVisible();
  await expect(page.getByText(/Je peux t.aider sur les prospects/i)).toHaveCount(0);
  await expect(page.getByText(/Routing request/i)).toHaveCount(0);

  await page.reload();
  await expect(chatParagraph(page, 'ça va ?')).toBeVisible();
  await expect(page.getByText(/agent GTM isimple/i)).toBeVisible();
});

test('thread composer supports Shift+Enter and Enter submit', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');
  await submitEmptyComposer(page, 'hello');
  await expect(page.getByText(/isimple GTM agent/i)).toBeVisible();

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

  await expect(page.getByText('Target').first()).toBeVisible();
  await expect(page.getByText('Search').first()).toBeVisible();
  await expect(page.getByText('Review').first()).toBeVisible();
  await expect(page.getByText('First prospect list').first()).toBeVisible();
  await expect(page.getByText('Claire Martin')).toBeVisible();
  await expect(page.getByText('Nicolas Bernard')).toBeVisible();
  await expect(page.getByRole('link', { name: /LinkedIn/i }).first()).toHaveAttribute('href', /linkedin\.com/);
  await expect(page.getByText(/2 selected/i).first()).toBeVisible();
});

test('mixed request runs prospect finder and campaign status in one thread', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');

  await submitEmptyComposer(page, 'find 20 property managers in Lyon and show current campaign updates');

  await expect(page.getByText('Campaigns and sequences').first()).toBeVisible();
  await expect(page.getByText(/active sequence.*draft/i).first()).toBeVisible();
  await expect(page.getByText('Search').first()).toBeVisible();
  await expect(page.getByText('First prospect list').first()).toBeVisible();
  await expect(page.getByText('Claire Martin')).toBeVisible();
});

test('mixed request keeps campaign result and shows retryable prospect search failure', async ({ page }) => {
  const controls = await installMockOutreach(page);
  controls.failNextSearch();
  await page.goto('/launch');

  await submitEmptyComposer(page, 'je veux trouver environ 50 prospects dirigeants de petites pme industrielles de la région lyonnaise et vérifier les campagnes en cours');

  await expect(page.getByText('Campaigns and sequences').first()).toBeVisible();
  await expect(page.getByText(/active sequence.*draft/i).first()).toBeVisible();
  await expect(page.getByText(/La recherche a pris trop longtemps/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /retry search/i })).toBeVisible();
  await expect(page.getByText(/dirigeants PME industrielles/i)).toBeVisible();
  await expect(page.getByText(/network error/i)).toHaveCount(0);
  await expect(page.getByText(/Routing request/i)).toHaveCount(0);
  await expect(page.getByText(/Interpreting target/i)).toHaveCount(0);
  await expect(page.getByText(/Planning search/i)).toHaveCount(0);
  await expect(page.getByText(/Validating candidates/i)).toHaveCount(0);
});

test('off-domain chat is guarded and cannot contaminate the next prospect search', async ({ page }) => {
  await installMockOutreach(page);
  await page.goto('/launch');

  await submitEmptyComposer(page, 'ça va ?');
  await expect(page.getByText(/agent GTM isimple/i)).toBeVisible();

  await submitThreadMessage(page, 'qui est zidane ?');
  await expect(page.getByText(/Je reste sur Orianna\/isimple/i).last()).toBeVisible();

  await submitThreadMessage(page, "multiplication d'hadamard");
  await expect(page.getByText(/Je reste sur Orianna\/isimple/i).last()).toBeVisible();

  await submitThreadMessage(page, '25 gestionnaires property management indépendant autour de lyon');
  await expect(page.getByText(/2 prospect\(s\) strictement vérifiés sur 25/i).first()).toBeVisible();
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
  await expect(chatParagraph(page, /could not complete this action/i)).toBeVisible();
  await expect(page.getByText('Mock agent failure')).toHaveCount(0);
});
