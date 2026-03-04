import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('DM header controls (#35)', () => {
  test('DM header shows search bar, star, bell, and menu', async ({ page }) => {
    await login(page, 'alice@slawk.dev', 'password123');

    // Click a DM conversation in the sidebar
    const sidebar = page.getByTestId('sidebar');
    await sidebar.locator('button').filter({ hasText: 'Eve Johnson' }).first().click();

    // Wait for DM conversation to load
    const dmConversation = page.getByTestId('dm-conversation');
    await expect(dmConversation).toBeVisible({ timeout: 10_000 });

    // Should have a search input in the header
    const searchInput = dmConversation.locator('input[placeholder="Search"]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Should have a star/bookmark button
    const starBtn = dmConversation.getByTestId('dm-star-button');
    await expect(starBtn).toBeVisible();

    // Should have a notification bell
    const bellBtn = dmConversation.getByTestId('dm-notification-bell');
    await expect(bellBtn).toBeVisible();

    // Should have a three-dot menu
    const menuBtn = dmConversation.getByTestId('dm-header-menu');
    await expect(menuBtn).toBeVisible();
  });
});
