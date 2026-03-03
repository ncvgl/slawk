import { test, expect } from '@playwright/test';
import { register, uniqueEmail, sendMessage, waitForMessage, clickChannel, waitForChannelReady } from './helpers';

test.describe('Bookmarks', () => {
  test('bookmark persists after navigating away and back', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'BookmarkTester', email, 'password123');

    // Navigate to general channel
    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    // Send a unique message to bookmark
    const uniqueText = `Bookmark me ${Date.now()}`;
    await sendMessage(page, uniqueText);
    await waitForMessage(page, uniqueText);

    // Hover over the message to reveal action buttons
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText }).first();
    await messageRow.hover();

    // Click the bookmark button
    const hoverToolbar = page.locator('.absolute.-top-4.right-5').first();
    const bookmarkBtn = hoverToolbar.getByTestId('bookmark-button');
    await bookmarkBtn.click();

    // Verify the bookmark icon turns yellow (fill-current class applied)
    const bookmarkIcon = messageRow.getByTestId('bookmark-icon');
    await expect(bookmarkIcon).toHaveClass(/text-yellow-500/, { timeout: 5000 });

    // Navigate away to a different channel
    await clickChannel(page, 'random');
    await waitForChannelReady(page);

    // Navigate back to general
    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    // Wait for messages to load and verify bookmark is still active
    await waitForMessage(page, uniqueText);
    const messageRowAfter = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText }).first();
    await messageRowAfter.hover();

    const bookmarkIconAfter = messageRowAfter.getByTestId('bookmark-icon');
    await expect(bookmarkIconAfter).toHaveClass(/text-yellow-500/, { timeout: 5000 });
  });

  test('can toggle bookmark off after re-navigation', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'UnbookmarkTester', email, 'password123');

    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    const uniqueText = `Toggle bookmark ${Date.now()}`;
    await sendMessage(page, uniqueText);
    await waitForMessage(page, uniqueText);

    // Hover and bookmark
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText }).first();
    await messageRow.hover();
    const hoverToolbar = page.locator('.absolute.-top-4.right-5').first();
    await hoverToolbar.getByTestId('bookmark-button').click();

    // Verify bookmarked
    await expect(messageRow.getByTestId('bookmark-icon')).toHaveClass(/text-yellow-500/, { timeout: 5000 });

    // Navigate away and back
    await clickChannel(page, 'random');
    await waitForChannelReady(page);
    await clickChannel(page, 'general');
    await waitForChannelReady(page);
    await waitForMessage(page, uniqueText);

    // Hover and unbookmark
    const messageRowAfter = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText }).first();
    await messageRowAfter.hover();
    const hoverToolbarAfter = page.locator('.absolute.-top-4.right-5').first();
    await hoverToolbarAfter.getByTestId('bookmark-button').click();

    // Verify unbookmarked (should not have yellow class)
    await expect(messageRowAfter.getByTestId('bookmark-icon')).not.toHaveClass(/text-yellow-500/, { timeout: 5000 });
  });
});
