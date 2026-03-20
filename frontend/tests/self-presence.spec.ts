import { test, expect } from '@playwright/test';
import { login, waitForChannelReady, TEST_PASSWORD } from './helpers';

test.describe('Self presence indicator', () => {
  test('shows green (online) after login', async ({ page }) => {
    await login(page, 'alice@slawk.dev', TEST_PASSWORD);
    await waitForChannelReady(page);

    // The user menu button contains the avatar with the status dot
    const avatarButton = page.getByTestId('user-menu-button');
    await expect(avatarButton).toBeVisible({ timeout: 10_000 });

    // Should show green online dot, not gray offline dot
    const greenDot = avatarButton.locator('.bg-green-500');
    const grayDot = avatarButton.locator('.bg-gray-400');
    await expect(greenDot).toHaveCount(1, { timeout: 5_000 });
    await expect(grayDot).toHaveCount(0);
  });

  test('shows green (online) after page refresh', async ({ page }) => {
    await login(page, 'alice@slawk.dev', TEST_PASSWORD);
    await waitForChannelReady(page);

    // Refresh the page — this triggers hydrate() which races with WebSocket connect
    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 20_000 });
    await waitForChannelReady(page);

    const avatarButton = page.getByTestId('user-menu-button');
    await expect(avatarButton).toBeVisible({ timeout: 10_000 });

    // After refresh, should still be green (online), not gray (offline)
    const greenDot = avatarButton.locator('.bg-green-500');
    const grayDot = avatarButton.locator('.bg-gray-400');
    await expect(greenDot).toHaveCount(1, { timeout: 5_000 });
    await expect(grayDot).toHaveCount(0);
  });
});
