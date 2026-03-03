import { test, expect } from '@playwright/test';
import { uniqueEmail, register } from './helpers';

test.describe('Channel duplicate name error', () => {
  test.beforeEach(async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Dup Tester', email, 'password123');
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });

  test('shows error when creating a channel with a duplicate name and keeps dialog open', async ({ page }) => {
    // Open the Add Channel dialog
    await page.locator('button').filter({ hasText: 'Add channels' }).click();

    const nameInput = page.getByPlaceholder(/plan-budget/i);
    await expect(nameInput).toBeVisible({ timeout: 3_000 });

    // Try to create a channel with the name "general" which already exists
    await nameInput.fill('general');

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/channels') && resp.request().method() === 'POST'
    );

    await page.getByRole('button', { name: /create$/i }).click();
    await responsePromise;

    // Error message should be visible
    await expect(page.getByTestId('channel-error')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId('channel-error')).toHaveText('Channel name already exists');

    // Dialog should still be open (the input is still visible)
    await expect(nameInput).toBeVisible();

    // Error should clear when user starts typing
    await nameInput.fill('general-');
    await expect(page.getByTestId('channel-error')).not.toBeVisible();
  });
});
