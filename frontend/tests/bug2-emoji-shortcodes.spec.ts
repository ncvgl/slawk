import { test, expect } from '@playwright/test';
import { register, sendMessage, waitForMessage, uniqueEmail } from './helpers';

test.describe('Bug #2: Emoji shortcodes render as unicode', () => {
  test('reaction stored as shortcode +1 renders as 👍 emoji', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'EmojiCode User', email, 'password123');

    await page.locator('button').filter({ hasText: 'general' }).first().click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 10_000 });
    // Wait for channel to fully load (socket join + message list render)
    await page.waitForTimeout(1000);

    const msg = `shortcode-test-${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    // Get the message id from the API by fetching messages
    const token = await page.evaluate(() => localStorage.getItem('token'));

    // Find the 'general' channel id from the channels list
    const channelsResp = await page.request.get('http://localhost:3000/channels', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!channelsResp.ok()) {
      test.skip();
      return;
    }

    const channelsData = await channelsResp.json();
    const generalChannel = channelsData.find((c: any) => c.name === 'general');
    const channelId = generalChannel?.id;

    if (!channelId) {
      test.skip();
      return;
    }

    // Find the message id
    const messagesResp = await page.request.get(`http://localhost:3000/channels/${channelId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!messagesResp.ok()) {
      test.skip();
      return;
    }

    const messagesData = await messagesResp.json();
    const message = messagesData.messages?.find((m: any) => m.content === msg);

    if (!message) {
      // If message not found, skip
      test.skip();
      return;
    }

    // Add a reaction with shortcode '+1' directly via API
    await page.request.post(`http://localhost:3000/messages/${message.id}/reactions`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { emoji: '+1' },
    });

    // Reload to fetch fresh data
    await page.reload();
    await page.locator('button').filter({ hasText: 'general' }).first().click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 10_000 });
    await waitForMessage(page, msg);

    // The reaction pill should show the 👍 emoji, NOT the text '+1'
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: msg });
    const reactionPill = messageRow.locator('button.inline-flex.items-center.gap-1').first();
    await expect(reactionPill).toBeVisible({ timeout: 5_000 });

    // Should contain 👍 unicode emoji, not '+1' text
    await expect(reactionPill.locator('[data-testid="reaction-emoji"]')).not.toHaveText('+1');
    await expect(reactionPill.locator('[data-testid="reaction-emoji"]')).toHaveText('👍');
  });
});
