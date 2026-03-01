import { test, expect } from '@playwright/test';
import { register, uniqueEmail, waitForMessage } from './helpers';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_FILE_DIR = path.join(__dirname, 'test-fixtures');
const TEST_IMAGE_PATH = path.join(TEST_FILE_DIR, 'test-image.png');

test.beforeAll(async () => {
  if (!fs.existsSync(TEST_FILE_DIR)) {
    fs.mkdirSync(TEST_FILE_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    // Minimal valid 1x1 PNG
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82,
    ]);
    fs.writeFileSync(TEST_IMAGE_PATH, pngHeader);
  }
});

test.describe('File Uploads', () => {
  test('user can upload an image and it appears in the message with preview', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'FileUser', email, 'password123');

    // Click the general channel explicitly to make sure we're in the right place
    await page.getByText('general').click();
    await page.waitForTimeout(500);

    // Click the plus/attach button in the message input
    const attachButton = page.getByTestId('attach-file-button');
    await expect(attachButton).toBeVisible();

    // Set up file chooser handler and click attach
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      attachButton.click(),
    ]);

    // Select a file
    await fileChooser.setFiles(TEST_IMAGE_PATH);

    // Should see file preview/attachment indicator before sending
    await expect(page.getByTestId('file-preview')).toBeVisible({ timeout: 5000 });

    // Send the message with the file
    const editor = page.locator('.ql-editor');
    await editor.click();
    await page.keyboard.type('Here is an image', { delay: 10 });
    await page.keyboard.press('Enter');

    // The message should appear with file attachment
    await waitForMessage(page, 'Here is an image');

    // Should see file attachment with image preview in the message
    const fileAttachment = page.locator('[data-testid="message-file"]').first();
    await expect(fileAttachment).toBeVisible({ timeout: 10000 });

    // Image files should render as img elements
    await expect(fileAttachment.locator('img')).toBeVisible({ timeout: 5000 });
  });
});
