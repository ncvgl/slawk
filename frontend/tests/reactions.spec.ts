import { test, expect } from '@playwright/test';
import { login, sendMessage, waitForMessage } from './helpers';

/**
 * Helper: open emoji picker from hover toolbar, search for an emoji, and click it.
 * emoji-mart uses shadow DOM, so we use role-based selectors from the accessibility tree.
 */
async function addReactionViaHover(page: import('@playwright/test').Page, messageRow: import('@playwright/test').Locator) {
  await messageRow.hover();

  // Click the emoji (Smile) button — first button in the hover toolbar
  const hoverToolbar = page.locator('.absolute.-top-4.right-5');
  await hoverToolbar.locator('button').first().click();

  // Wait for the emoji picker to render (it's a custom element but accessible via roles)
  const searchBox = page.getByRole('searchbox', { name: 'Search' });
  await expect(searchBox).toBeVisible({ timeout: 5_000 });

  // Search for "thumbsup" and click the result
  await searchBox.fill('thumbsup');
  await page.waitForTimeout(500);

  // Click the 👍 button from search results
  await page.getByRole('button', { name: '👍' }).click();
}

test.describe('Reactions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await expect(page.locator('.ql-editor')).toBeVisible();
  });

  test('user can add emoji reaction to a message', async ({ page }) => {
    const msg = `React to me ${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    const messageRow = page
      .locator('.group.relative.flex.px-5')
      .filter({ hasText: msg });

    await addReactionViaHover(page, messageRow);

    // A reaction pill should now appear on the message
    const reactionPill = messageRow.locator('button').filter({ hasText: /👍/ });
    await expect(reactionPill).toBeVisible({ timeout: 5_000 });
    await expect(reactionPill).toContainText('1');
  });

  test('user can remove their reaction', async ({ page }) => {
    const msg = `Remove reaction ${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    const messageRow = page
      .locator('.group.relative.flex.px-5')
      .filter({ hasText: msg });

    await addReactionViaHover(page, messageRow);

    // Verify reaction appeared
    const reactionPill = messageRow.locator('button.inline-flex.items-center.gap-1');
    await expect(reactionPill.first()).toBeVisible({ timeout: 5_000 });

    // Click the reaction pill to remove our reaction
    await reactionPill.first().click();

    // The reaction pill should disappear
    await expect(reactionPill).not.toBeVisible({ timeout: 5_000 });
  });

  test('reaction count updates correctly', async ({ page }) => {
    const msg = `Count test ${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    const messageRow = page
      .locator('.group.relative.flex.px-5')
      .filter({ hasText: msg });

    await addReactionViaHover(page, messageRow);

    // Verify reaction count is 1
    const reactionPill = messageRow.locator('button.inline-flex.items-center.gap-1');
    await expect(reactionPill.first()).toContainText('1', { timeout: 5_000 });

    // Click the same reaction pill to toggle it off
    await reactionPill.first().click();

    // Reaction should be removed entirely
    await expect(reactionPill).not.toBeVisible({ timeout: 5_000 });
  });
});
