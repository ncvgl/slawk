import { test, expect } from '@playwright/test';
import { login, clickChannel, waitForChannelReady } from './helpers';

test.describe('Sidebar channel sorting', () => {
  test('channels are sorted alphabetically in the sidebar (#85)', async ({ page }) => {
    await login(page, 'alice@slawk.dev', 'password123');
    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    // Get all channel names from sidebar
    const sidebar = page.getByTestId('sidebar');
    const channelButtons = sidebar.locator('span.truncate');
    await expect(channelButtons.first()).toBeVisible({ timeout: 5000 });

    const names = await channelButtons.allTextContents();
    // Filter to only actual channel names (they start with lowercase letters)
    const channelNames = names.filter((n) => /^[a-z]/.test(n));

    // Verify they are sorted
    const sorted = [...channelNames].sort((a, b) => a.localeCompare(b));
    expect(channelNames).toEqual(sorted);
  });
});
