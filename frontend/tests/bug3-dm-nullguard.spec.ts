import { test, expect } from '@playwright/test';
import { register, uniqueEmail } from './helpers';

test.describe('Bug #3: fetchDirectMessages null-guard', () => {
  test('no TypeError when fetching DMs after real conversation exists', async ({ browser }) => {
    // User A registers
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const emailA = uniqueEmail();
    await register(pageA, 'Bug3-A', emailA, 'password123');
    await expect(pageA.locator('button').filter({ hasText: 'Add teammates' })).toBeVisible({ timeout: 10_000 });

    // User B registers
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const emailB = uniqueEmail();
    await register(pageB, 'Bug3-B', emailB, 'password123');
    await expect(pageB.locator('button').filter({ hasText: 'Add teammates' })).toBeVisible({ timeout: 10_000 });

    // User A starts a DM with User B
    await pageA.locator('button').filter({ hasText: 'Add teammates' }).click();
    await expect(pageA.getByRole('heading', { name: 'Direct message' })).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId('teammate-search').fill('Bug3-B');
    const userButton = pageA.getByRole('button', { name: /Bug3-B/ }).first();
    await expect(userButton).toBeVisible({ timeout: 5_000 });
    await userButton.click();
    await expect(pageA.getByTestId('dm-conversation')).toBeVisible({ timeout: 5_000 });
    const dmInput = pageA.getByTestId('dm-message-input');
    await dmInput.fill('hello');
    await dmInput.press('Enter');
    await pageA.waitForTimeout(1_000);
    await ctxA.close();

    // User B reloads — fetchDirectMessages will run with a real DM in DB
    const consoleErrors: string[] = [];
    pageB.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await pageB.reload();
    await expect(pageB.locator('button').filter({ hasText: 'Add teammates' })).toBeVisible({ timeout: 10_000 });
    await pageB.waitForTimeout(2_000);

    const typeErrors = consoleErrors.filter((e) => e.includes('Cannot read properties of undefined'));
    expect(typeErrors).toHaveLength(0);
    await ctxB.close();
  });
});
