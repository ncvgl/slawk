import { test, expect } from '@playwright/test';
import { register, uniqueEmail } from './helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Bug #6: File attachment included in sent message', () => {
  test('attaching a file and sending creates a message with the file', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'FileAttach User', email, 'password123');

    await page.locator('button').filter({ hasText: 'general' }).first().click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    // Click the attach file button (+ button in the toolbar)
    const fileInput = page.locator('input[type="file"]');

    // Use the test fixture image
    const filePath = path.join(__dirname, 'test-fixtures', 'test-image.png');

    // Set the file on the hidden input directly
    await fileInput.setInputFiles(filePath);

    // Wait for the file preview badge to appear
    await expect(page.locator('[data-testid="file-preview"]')).toBeVisible({ timeout: 5_000 });

    // Send the message (click the send button)
    await page.locator('button[class*="bg-\\[\\#007a5a\\]"]').click();

    // The message with the file attachment should appear in the chat
    await expect(page.locator('[data-testid="message-file"]').first()).toBeVisible({ timeout: 5_000 });
  });
});
