import { test, expect } from '@playwright/test';
import { register, uniqueEmail } from './helpers';

test.describe('User Presence', () => {
  test('logged-in user shows online status indicator', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Presence User', email, 'password123');

    // The user's own avatar in the sidebar should show an online indicator (green dot)
    const avatarButton = page.getByTestId('user-avatar-button');
    await expect(avatarButton).toBeVisible();

    // The status dot should be visible and green (online)
    const statusDot = avatarButton.locator('.bg-green-500');
    await expect(statusDot).toBeVisible();
  });

  test('channel members list shows online/offline indicators', async ({ browser }) => {
    // Create two users
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    // Register user 1 in context 1
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await register(page1, 'UserAlpha', email1, 'password123');

    // Register user 2 in context 2
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, 'UserBravo', email2, 'password123');

    // Both users should be in #general. Click the members button to see the members list.
    const membersButton = page1.locator('button').filter({ has: page1.locator('.lucide-users') });
    await membersButton.click();

    // The members panel should show up with online indicators
    const membersPanel = page1.getByTestId('members-panel');
    await expect(membersPanel).toBeVisible({ timeout: 5000 });

    // Should show "Online" section header with count
    await expect(membersPanel.getByTestId('online-members')).toBeVisible({ timeout: 5000 });

    // Clean up
    await context1.close();
    await context2.close();
  });

  test('user going offline updates presence for other users', async ({ browser }) => {
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    // Register user 1
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await register(page1, 'WatcherUser', email1, 'password123');

    // Register user 2
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, 'LeaverUser', email2, 'password123');

    // Wait a bit for presence to propagate
    await page1.waitForTimeout(1000);

    // Open members panel for user 1
    const membersButton = page1.locator('button').filter({ has: page1.locator('.lucide-users') });
    await membersButton.click();
    const membersPanel = page1.getByTestId('members-panel');
    await expect(membersPanel).toBeVisible({ timeout: 5000 });

    // LeaverUser should appear in the online section (use .first() since name may exist from past runs)
    await expect(
      membersPanel.getByTestId('online-members').getByText('LeaverUser').first()
    ).toBeVisible({ timeout: 5000 });

    // Close user 2's context (simulates going offline)
    await context2.close();

    // LeaverUser should move to the offline section (wait for presence update)
    await expect(
      membersPanel.getByTestId('offline-members').getByText('LeaverUser').first()
    ).toBeVisible({ timeout: 15000 });

    await context1.close();
  });
});
