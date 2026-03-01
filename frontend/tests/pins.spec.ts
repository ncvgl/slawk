import { test, expect } from '@playwright/test';
import { register, uniqueEmail, sendMessage, waitForMessage } from './helpers';

test.describe('Pinned Messages', () => {
  test('user can pin a message and view it in pins panel', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'PinTester', email, 'password123');

    // Select general channel
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    // Send a message to pin
    const uniqueText = `Pin me ${Date.now()}`;
    await sendMessage(page, uniqueText);
    await waitForMessage(page, uniqueText);

    // Hover over the message to show action buttons
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText }).first();
    await messageRow.hover();

    // Click the more actions button (last button in hover toolbar)
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    await hoverToolbar.locator('button').last().click();

    // Click "Pin message" from the dropdown
    await page.getByText('Pin message').click();

    // The message should now show a pin indicator
    await expect(messageRow.locator('[data-testid="pin-indicator"]')).toBeVisible({ timeout: 5000 });

    // Click the Pins tab to see pinned messages
    await page.getByRole('button', { name: 'Pins' }).click();

    // The pinned message should appear in the pins panel
    await expect(page.getByTestId('pins-panel').getByText(uniqueText)).toBeVisible({ timeout: 5000 });
  });
});
