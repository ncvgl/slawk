import { test, expect } from '@playwright/test';
import { register, uniqueEmail, clickChannel , TEST_PASSWORD } from './helpers';
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
    await register(page, 'FileUser', email, TEST_PASSWORD);

    await clickChannel(page, 'general');
    await page.waitForTimeout(500);

    const attachButton = page.getByTestId('attach-file-button');
    await expect(attachButton).toBeVisible();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      attachButton.click(),
    ]);

    await fileChooser.setFiles(TEST_IMAGE_PATH);
    await expect(page.getByTestId('file-preview')).toBeVisible({ timeout: 5000 });

    // Use unique message text to avoid clashing with past runs
    const uniqueText = `Image upload ${Date.now()}`;
    const editor = page.locator('.ql-editor');
    await editor.click();
    await page.keyboard.type(uniqueText, { delay: 10 });
    await page.keyboard.press('Enter');

    // Wait for the specific message
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText });
    await expect(messageRow.first()).toBeVisible({ timeout: 10000 });

    // Should see file attachment with image preview
    const fileAttachment = messageRow.first().locator('[data-testid="message-file"]');
    await expect(fileAttachment).toBeVisible({ timeout: 10000 });
    await expect(fileAttachment.locator('img')).toBeVisible({ timeout: 5000 });
  });

  test('image upload shows filename, size, and download button (#29)', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'ImgMetaUser', email, TEST_PASSWORD);

    await clickChannel(page, 'general');
    await page.waitForTimeout(500);

    const attachButton = page.getByTestId('attach-file-button');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      attachButton.click(),
    ]);
    await fileChooser.setFiles(TEST_IMAGE_PATH);
    await expect(page.getByTestId('file-preview')).toBeVisible({ timeout: 5000 });

    const uniqueText = `Img meta ${Date.now()}`;
    const editor = page.locator('.ql-editor');
    await editor.click();
    await page.keyboard.type(uniqueText, { delay: 10 });
    await page.keyboard.press('Enter');

    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText });
    await expect(messageRow.first()).toBeVisible({ timeout: 10000 });

    const fileAttachment = messageRow.first().locator('[data-testid="message-file"]');
    await expect(fileAttachment).toBeVisible({ timeout: 10000 });

    // Image should have filename displayed
    await expect(fileAttachment.getByTestId('image-filename')).toBeVisible();
    await expect(fileAttachment.getByTestId('image-filename')).toHaveText(/test-image\.png/);

    // Image should have file size displayed
    await expect(fileAttachment.getByTestId('image-filesize')).toBeVisible();

    // Image should have a download button
    await expect(fileAttachment.getByTestId('image-download')).toBeVisible();
  });

  test('user can drag and drop an image into the editor (#157)', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'DragDropUser', email, TEST_PASSWORD);

    await clickChannel(page, 'general');
    await page.waitForTimeout(500);

    // Read the test image file
    const buffer = fs.readFileSync(TEST_IMAGE_PATH);
    const dataTransfer = await page.evaluateHandle((data) => {
      const dt = new DataTransfer();
      const file = new File([new Uint8Array(data)], 'test-image.png', { type: 'image/png' });
      dt.items.add(file);
      return dt;
    }, Array.from(buffer));

    // Simulate drag and drop on the editor
    const editor = page.locator('.ql-editor');
    await editor.dispatchEvent('drop', { dataTransfer });

    // File preview should appear
    await expect(page.getByTestId('file-preview')).toBeVisible({ timeout: 5000 });

    // Send the message with the dropped image
    const uniqueText = `Drag drop ${Date.now()}`;
    await editor.click();
    await page.keyboard.type(uniqueText, { delay: 10 });
    await page.keyboard.press('Enter');

    // Verify the message with image attachment appears
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText });
    await expect(messageRow.first()).toBeVisible({ timeout: 10000 });

    const fileAttachment = messageRow.first().locator('[data-testid="message-file"]');
    await expect(fileAttachment).toBeVisible({ timeout: 10000 });
    await expect(fileAttachment.locator('img')).toBeVisible({ timeout: 5000 });
  });
});
