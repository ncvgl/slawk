import { test, expect } from '@playwright/test';
import { login, clickChannel, waitForChannelReady } from './helpers';

test.describe('Browse channels', () => {
  test('browse channels tab shows all public channels with Joined badges', async ({ page }) => {
    await login(page, 'alice@slawk.dev', 'password123');
    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    // Open the Add channels dialog
    await page.locator('button').filter({ hasText: 'Add channels' }).click();

    // Switch to Browse channels tab
    await page.getByText('Browse channels').click();

    // Should see channels listed (not "No channels available to join")
    const channelRows = page.locator('[data-channel-name]');
    await expect(channelRows.first()).toBeVisible({ timeout: 5000 });

    // Should have multiple channels listed
    const count = await channelRows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Already-joined channels should show "Joined" badge
    const joinedBadges = page.locator('[data-testid="joined-badge"]');
    await expect(joinedBadges.first()).toBeVisible();
  });

  test('#general channel appears in Browse channels list (#27)', async ({ page }) => {
    await login(page, 'alice@slawk.dev', 'password123');
    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    // Open the Add channels dialog
    await page.locator('button').filter({ hasText: 'Add channels' }).click();

    // Switch to Browse channels tab
    await page.getByText('Browse channels').click();

    // Wait for channels to load
    const channelRows = page.locator('[data-channel-name]');
    await expect(channelRows.first()).toBeVisible({ timeout: 5000 });

    // All 8 public channels must be listed
    const count = await channelRows.count();
    expect(count).toBe(8);

    // #general must be listed
    const generalRow = page.locator('[data-channel-name="general"]');
    await expect(generalRow).toBeVisible();
  });
});
