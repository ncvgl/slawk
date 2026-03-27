import { test, expect } from '@playwright/test';
import {
  login,
  register,
  uniqueEmail,
  sendMessage,
  waitForMessage,
  clickChannel,
  waitForChannelReady,
  TEST_PASSWORD,
} from './helpers';

test.describe('Unreads feed', () => {
  test('clicking Unreads nav item navigates to /unreads', async ({ page }) => {
    await login(page, 'alice@slawk.dev', TEST_PASSWORD);

    // Click the Unreads nav item
    const unreadsNav = page.getByTestId('nav-item-unreads');
    await expect(unreadsNav).toBeVisible();
    await unreadsNav.click();

    // Should navigate to /unreads
    await expect(page).toHaveURL('/unreads');

    // Should show unreads feed header
    await expect(page.getByText('Unreads', { exact: true })).toBeVisible();
  });

  test('should show unread messages from multiple channels', async ({ page, context }) => {
    // Create two users
    const user1Email = uniqueEmail();
    const user2Email = uniqueEmail();

    // User 1 registers and creates a channel
    await register(page, 'User One', user1Email, TEST_PASSWORD);
    await page.getByText('Add channels').click();
    await page.getByPlaceholder('e.g. marketing').fill('test-unreads-1');
    await page.getByRole('button', { name: /create channel/i }).click();
    await waitForChannelReady(page);

    // User 1 sends a message
    await sendMessage(page, 'Message in channel 1');
    await waitForMessage(page, 'Message in channel 1');

    // Switch to general and send another message
    await clickChannel(page, 'general');
    await waitForChannelReady(page);
    await sendMessage(page, 'Message in general');
    await waitForMessage(page, 'Message in general');

    // User 2 joins both channels
    const page2 = await context.newPage();
    await register(page2, 'User Two', user2Email, TEST_PASSWORD);

    // Join test-unreads-1
    await page2.getByText('Add channels').click();
    await page2.getByRole('button', { name: /browse channels/i }).click();
    await page2
      .locator('button')
      .filter({ hasText: 'test-unreads-1' })
      .getByRole('button', { name: /join/i })
      .click();
    await waitForChannelReady(page2);

    // Navigate to unreads
    await page2.getByTestId('nav-item-unreads').click();
    await expect(page2).toHaveURL('/unreads');

    // Should see both unread messages
    await expect(page2.getByText('Message in channel 1')).toBeVisible({ timeout: 10_000 });
    await expect(page2.getByText('Message in general')).toBeVisible({ timeout: 10_000 });
  });

  test('should show unread badge count on Unreads nav item', async ({ page, context }) => {
    const user1Email = uniqueEmail();
    const user2Email = uniqueEmail();

    // User 1 registers
    await register(page, 'User One', user1Email, TEST_PASSWORD);

    // User 2 registers
    const page2 = await context.newPage();
    await register(page2, 'User Two', user2Email, TEST_PASSWORD);

    // User 1 sends 3 messages in general
    await clickChannel(page, 'general');
    await waitForChannelReady(page);
    for (let i = 1; i <= 3; i++) {
      await sendMessage(page, `Unread message ${i}`);
      await waitForMessage(page, `Unread message ${i}`);
    }

    // User 2 should see badge with count 3
    await page2.reload();
    await expect(page2.getByTestId('sidebar')).toBeVisible({ timeout: 10_000 });

    const unreadsNav = page2.getByTestId('nav-item-unreads');
    const badge = unreadsNav.locator('span.bg-red-500');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toHaveText('3');
  });

  test('badge should update when messages are read', async ({ page, context }) => {
    const user1Email = uniqueEmail();
    const user2Email = uniqueEmail();

    // User 1 registers
    await register(page, 'User One', user1Email, TEST_PASSWORD);

    // User 2 registers
    const page2 = await context.newPage();
    await register(page2, 'User Two', user2Email, TEST_PASSWORD);

    // User 1 sends 2 messages in general
    await clickChannel(page, 'general');
    await waitForChannelReady(page);
    await sendMessage(page, 'First message');
    await waitForMessage(page, 'First message');
    await sendMessage(page, 'Second message');
    await waitForMessage(page, 'Second message');

    // User 2 should see badge with count 2
    await page2.reload();
    await expect(page2.getByTestId('sidebar')).toBeVisible({ timeout: 10_000 });

    let unreadsNav = page2.getByTestId('nav-item-unreads');
    let badge = unreadsNav.locator('span.bg-red-500');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toHaveText('2');

    // User 2 clicks general channel (marks as read)
    await clickChannel(page2, 'general');
    await waitForChannelReady(page2);
    await waitForMessage(page2, 'Second message');

    // Wait a moment for the read marker to be sent
    await page2.waitForTimeout(1000);

    // Badge should disappear (count = 0)
    unreadsNav = page2.getByTestId('nav-item-unreads');
    badge = unreadsNav.locator('span.bg-red-500');
    await expect(badge).not.toBeVisible();
  });

  test('should not show badge when no unreads', async ({ page }) => {
    await login(page, 'alice@slawk.dev', TEST_PASSWORD);

    // Clear any unreads by visiting general
    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    const unreadsNav = page.getByTestId('nav-item-unreads');
    const badge = unreadsNav.locator('span.bg-red-500');

    // Badge should not be visible
    await expect(badge).not.toBeVisible();
  });

  test('unreads feed should show channel names', async ({ page, context }) => {
    const user1Email = uniqueEmail();
    const user2Email = uniqueEmail();

    // User 1 registers
    await register(page, 'User One', user1Email, TEST_PASSWORD);

    // User 1 creates a channel
    await page.getByText('Add channels').click();
    await page.getByPlaceholder('e.g. marketing').fill('test-channel-name');
    await page.getByRole('button', { name: /create channel/i }).click();
    await waitForChannelReady(page);

    // User 1 sends a message
    await sendMessage(page, 'Test message');
    await waitForMessage(page, 'Test message');

    // User 2 joins the channel
    const page2 = await context.newPage();
    await register(page2, 'User Two', user2Email, TEST_PASSWORD);

    await page2.getByText('Add channels').click();
    await page2.getByRole('button', { name: /browse channels/i }).click();
    await page2
      .locator('button')
      .filter({ hasText: 'test-channel-name' })
      .getByRole('button', { name: /join/i })
      .click();
    await waitForChannelReady(page2);

    // Navigate to unreads
    await page2.getByTestId('nav-item-unreads').click();
    await expect(page2).toHaveURL('/unreads');

    // Should see channel name in the feed
    await expect(page2.getByText('test-channel-name')).toBeVisible({ timeout: 10_000 });
    await expect(page2.getByText('Test message')).toBeVisible();
  });

  test('clicking unreads nav when already on unreads navigates to first channel', async ({ page }) => {
    await login(page, 'alice@slawk.dev', TEST_PASSWORD);

    // Navigate to unreads
    await page.getByTestId('nav-item-unreads').click();
    await expect(page).toHaveURL('/unreads');

    // Click unreads again
    await page.getByTestId('nav-item-unreads').click();

    // Should navigate to a channel (general or first available)
    await expect(page).toHaveURL(/\/c\/\d+/);
  });

  test('unreads feed should not show thread replies', async ({ page, context }) => {
    const user1Email = uniqueEmail();
    const user2Email = uniqueEmail();

    // User 1 registers
    await register(page, 'User One', user1Email, TEST_PASSWORD);

    // User 2 registers
    const page2 = await context.newPage();
    await register(page2, 'User Two', user2Email, TEST_PASSWORD);

    // User 1 sends a parent message
    await clickChannel(page, 'general');
    await waitForChannelReady(page);
    await sendMessage(page, 'Parent message');
    await waitForMessage(page, 'Parent message');

    // User 1 opens thread and sends a reply
    await page
      .locator('.group.relative.flex.px-5')
      .filter({ hasText: 'Parent message' })
      .hover();
    await page.getByTestId('reply-button').first().click();
    await expect(page.getByTestId('thread-panel')).toBeVisible();

    const threadEditor = page.locator('[data-testid="thread-panel"] .ql-editor');
    await threadEditor.click();
    await page.keyboard.type('Thread reply message', { delay: 10 });
    await page.keyboard.press('Enter');

    // Wait for reply to be sent
    await expect(
      page.locator('[data-testid="thread-panel"]').getByText('Thread reply message')
    ).toBeVisible({ timeout: 10_000 });

    // User 2 navigates to unreads
    await page2.getByTestId('nav-item-unreads').click();
    await expect(page2).toHaveURL('/unreads');

    // Should see parent message but not thread reply
    await expect(page2.getByText('Parent message')).toBeVisible({ timeout: 10_000 });
    await expect(page2.getByText('Thread reply message')).not.toBeVisible();

    // Badge should show 1, not 2
    const unreadsNav = page2.getByTestId('nav-item-unreads');
    const badge = unreadsNav.locator('span.bg-red-500');
    await expect(badge).toHaveText('1');
  });
});
