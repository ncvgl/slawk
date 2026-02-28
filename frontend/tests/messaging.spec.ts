import { test, expect } from '@playwright/test';
import { login, sendMessage, waitForMessage, uniqueEmail, register } from './helpers';

test.describe('Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Make sure we're on a channel (general should be auto-selected)
    await expect(page.locator('.ql-editor')).toBeVisible();
  });

  test('user can send a message in a channel', async ({ page }) => {
    const msg = `Hello from test ${Date.now()}`;
    await sendMessage(page, msg);

    // Message should appear in the message list
    await waitForMessage(page, msg);
  });

  test('user can edit their own message', async ({ page }) => {
    // Send a message first
    const original = `Edit me ${Date.now()}`;
    await sendMessage(page, original);
    await waitForMessage(page, original);

    // Hover over the message to reveal action buttons
    const messageEl = page.locator('.group.relative.flex.px-5').filter({ hasText: original });
    await messageEl.hover();

    // Click the "more" button (MoreHorizontal icon) in the hover toolbar
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    await hoverToolbar.locator('button').last().click();

    // Click "Edit message" from the dropdown/menu
    await page.getByText('Edit message').click();

    // Clear the textarea and type new content, then press Enter to save
    const editInput = page.locator('textarea');
    await editInput.fill('Edited message content');
    await page.keyboard.press('Enter');

    // The edited message should appear with "(edited)" indicator
    const editedRow = page.locator('.group.relative.flex.px-5').filter({ hasText: 'Edited message content' }).last();
    await expect(editedRow.getByText('(edited)').first()).toBeVisible({ timeout: 5_000 });
  });

  test('user can delete their own message', async ({ page }) => {
    // Send a message first
    const toDelete = `Delete me ${Date.now()}`;
    await sendMessage(page, toDelete);
    await waitForMessage(page, toDelete);

    // Hover over the message to reveal action buttons
    const messageEl = page.locator('.group.relative.flex.px-5').filter({ hasText: toDelete });
    await messageEl.hover();

    // Click the "more" button in the hover toolbar
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    await hoverToolbar.locator('button').last().click();

    // Click "Delete message" from the dropdown
    await page.getByText('Delete message').click();

    // Confirm deletion if there's a confirmation dialog
    const confirmButton = page.getByRole('button', { name: /delete|confirm/i });
    if (await confirmButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Message should no longer be visible
    await expect(
      page.locator('.group.relative.flex.px-5').filter({ hasText: toDelete })
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('messages appear in real-time for other users', async ({ browser }) => {
    // Create two browser contexts simulating two different users
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Register two unique users
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();
    await register(page1, 'User One', email1, 'password123');
    await register(page2, 'User Two', email2, 'password123');

    // Both users join the "general" channel via API
    for (const page of [page1, page2]) {
      await page.evaluate(async () => {
        const token = localStorage.getItem('token');
        const res = await fetch('/channels', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const channels = await res.json();
        const general = channels.find((c: { name: string }) => c.name === 'general');
        if (general) {
          await fetch(`/channels/${general.id}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
        }
      });
    }

    // Reload pages so socket reconnects and joins channels as member
    await page1.reload();
    await page2.reload();

    // Wait for app to load and select general channel
    for (const page of [page1, page2]) {
      await expect(page.getByRole('button', { name: 'Channels', exact: true })).toBeVisible({ timeout: 10_000 });
      await page.locator('button').filter({ hasText: 'general' }).click();
      await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5_000 });
    }

    // Give socket connections time to establish and join channel rooms
    await page1.waitForTimeout(1_000);

    // User 1 sends a message
    const realTimeMsg = `Real-time test ${Date.now()}`;
    await sendMessage(page1, realTimeMsg);

    // User 2 should see the message appear without refreshing
    await waitForMessage(page2, realTimeMsg);

    await context1.close();
    await context2.close();
  });
});
