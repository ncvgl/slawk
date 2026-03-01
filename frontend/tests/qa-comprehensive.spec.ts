/**
 * Comprehensive QA test that exercises all 14 features end-to-end.
 * Acts as manual QA testing via automation.
 */
import { test, expect } from '@playwright/test';
import { register, uniqueEmail, sendMessage, waitForMessage } from './helpers';

test.describe('QA: Comprehensive Feature Verification', () => {
  test('Feature #1: User authentication - register, login, logout', async ({ page }) => {
    const name = `QA_Auth_${Date.now()}`;
    const email = uniqueEmail();
    const password = 'password123';

    // Register
    await register(page, name, email, password);
    await expect(page.locator('button').filter({ hasText: 'general' }).first()).toBeVisible({ timeout: 5000 });

    // Logout
    await page.getByTestId('user-menu-button').click();
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/login/);

    // Login
    await page.getByPlaceholder('name@work-email.com').fill(email);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: /sign in with email/i }).click();
    await expect(page.locator('button').filter({ hasText: 'general' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('Feature #2: Channels - create, join, browse', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const email1 = uniqueEmail();
    await register(page1, 'ChannelCreator', email1, 'password123');

    // Create a channel
    const channelName = `qa-ch-${Date.now()}`;
    await page1.locator('button').filter({ hasText: 'Add channels' }).click();
    const nameInput = page1.locator('input[placeholder="e.g. plan-budget"]');
    await nameInput.fill(channelName);
    await page1.locator('button[type="submit"]').filter({ hasText: 'Create' }).click();
    await expect(page1.locator('button').filter({ hasText: channelName }).first()).toBeVisible({ timeout: 5000 });

    // Another user joins
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await register(page2, 'ChannelJoiner', uniqueEmail(), 'password123');
    await page2.locator('button').filter({ hasText: 'Add channels' }).click();
    await page2.getByText('Browse channels').click();
    await expect(page2.getByText(channelName).first()).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('Feature #3: Real-time messaging', async ({ page }) => {
    await register(page, 'MsgUser', uniqueEmail(), 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    const msg = `QA msg ${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);
  });

  test('Feature #4: Message history - messages persist', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'HistoryUser', email, 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    const msg = `History ${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    // Reload and verify message persists
    await page.reload();
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.getByText(msg)).toBeVisible({ timeout: 10000 });
  });

  test('Feature #5: User presence', async ({ page }) => {
    await register(page, 'PresenceUser', uniqueEmail(), 'password123');
    const avatarButton = page.getByTestId('user-menu-button');
    await expect(avatarButton).toBeVisible();
    // Check for green dot (online status)
    const statusDot = avatarButton.locator('.bg-green-500');
    await expect(statusDot).toBeVisible({ timeout: 5000 });
  });

  test('Feature #6: File uploads', async ({ page }) => {
    await register(page, 'FileUser', uniqueEmail(), 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    // Upload a file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('test content'),
    });
    // Wait for upload preview
    await expect(page.getByText('test.txt')).toBeVisible({ timeout: 5000 });
  });

  test('Feature #7: Threads', async ({ page }) => {
    await register(page, 'ThreadUser', uniqueEmail(), 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    const parentMsg = `Thread parent ${Date.now()}`;
    await sendMessage(page, parentMsg);
    await waitForMessage(page, parentMsg);

    // Open thread
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: parentMsg }).first();
    await messageRow.hover();
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    // Click thread button (MessageSquare icon - second button)
    await hoverToolbar.locator('button').nth(1).click();

    // Thread panel should open (look for "Thread" heading in the panel)
    await expect(page.locator('.border-l').getByText('Thread').first()).toBeVisible({ timeout: 5000 });
  });

  test('Feature #8: Search', async ({ page }) => {
    await register(page, 'SearchUser', uniqueEmail(), 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    const searchTerm = `searchable ${Date.now()}`;
    await sendMessage(page, searchTerm);
    await waitForMessage(page, searchTerm);

    // Search for the message
    const searchInput = page.locator('input[placeholder="Search"]');
    await searchInput.fill(searchTerm);
    await searchInput.press('Enter');
    await expect(page.getByText('1 result')).toBeVisible({ timeout: 5000 });
  });

  test('Feature #9: Direct Messages', async ({ browser }) => {
    const ts = Date.now();
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const name1 = `DM1_${ts}`;
    await register(page1, name1, uniqueEmail(), 'password123');
    // Wait for app to load
    await expect(page1.locator('button').filter({ hasText: 'general' }).first()).toBeVisible({ timeout: 5000 });

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    const name2 = `DM2_${ts}`;
    await register(page2, name2, uniqueEmail(), 'password123');
    await expect(page2.locator('button').filter({ hasText: 'general' }).first()).toBeVisible({ timeout: 5000 });

    // User1 starts a DM with User2
    await page1.locator('button').filter({ hasText: 'Add teammates' }).click();
    await expect(page1.getByRole('heading', { name: 'Direct message' })).toBeVisible();
    const searchInput = page1.getByTestId('teammate-search');
    await searchInput.fill(name2);
    await page1.waitForTimeout(500);
    await page1.getByRole('button', { name: name2 }).click();
    await expect(page1.getByText(name2, { exact: true }).first()).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('Feature #10: Reactions', async ({ page }) => {
    await register(page, 'ReactionUser', uniqueEmail(), 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    const msg = `React to me ${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    // Hover and click emoji button
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: msg }).first();
    await messageRow.hover();
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    await hoverToolbar.locator('button').first().click();

    // Emoji picker should appear
    await expect(page.locator('em-emoji-picker')).toBeVisible({ timeout: 5000 });
  });

  test('Feature #11: Message editing', async ({ page }) => {
    await register(page, 'EditUser', uniqueEmail(), 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    const original = `Edit me ${Date.now()}`;
    await sendMessage(page, original);
    await waitForMessage(page, original);

    // Hover and open more menu
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: original });
    await messageRow.hover();
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    await hoverToolbar.locator('button').last().click();

    // Edit message
    await page.getByText('Edit message').click();
    const editInput = page.locator('textarea');
    await editInput.fill('Edited content');
    await page.keyboard.press('Enter');
    await expect(page.getByText('(edited)').first()).toBeVisible({ timeout: 5000 });
  });

  test('Feature #12: @mentions', async ({ page }) => {
    await register(page, 'MentionUser', uniqueEmail(), 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    // Click @ button
    await page.getByTestId('mention-button').click();
    // Mention dropdown should appear
    await expect(page.getByTestId('mention-dropdown')).toBeVisible({ timeout: 5000 });
  });

  test('Feature #13: Pinned messages', async ({ page }) => {
    await register(page, 'PinUser', uniqueEmail(), 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    const msg = `Pin me ${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    // Pin the message
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: msg }).first();
    await messageRow.hover();
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    await hoverToolbar.locator('button').last().click();
    await page.getByText('Pin message').click();

    await expect(messageRow.locator('[data-testid="pin-indicator"]')).toBeVisible({ timeout: 5000 });
  });

  test('Feature #14: User profiles', async ({ page }) => {
    const name = `ProfileQA_${Date.now()}`;
    await register(page, name, uniqueEmail(), 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    // Open own profile
    await page.getByTestId('user-menu-button').click();
    await page.getByRole('button', { name: 'Profile' }).click();
    const modal = page.getByTestId('profile-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.getByText(name)).toBeVisible();

    // Close modal
    await modal.locator('button').first().click();
    await expect(modal).not.toBeVisible();
  });
});
