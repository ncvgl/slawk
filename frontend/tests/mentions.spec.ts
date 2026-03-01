import { test, expect } from '@playwright/test';
import { register, uniqueEmail } from './helpers';

test.describe('@Mentions', () => {
  test('user can @mention another user in a message', async ({ browser }) => {
    const ts = Date.now();
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();
    const name1 = `MentionSender${ts}`;
    const name2 = `MentionTarget${ts}`;

    // Register two users
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await register(page1, name1, email1, 'password123');

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, name2, email2, 'password123');

    // User 1 selects general channel
    await page1.locator('button').filter({ hasText: 'general' }).click();
    await expect(page1.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    // Type @ followed by partial name to trigger mention dropdown
    const editor = page1.locator('.ql-editor');
    await editor.click();
    await page1.keyboard.type(`Hey @${name2.slice(0, 8)}`, { delay: 50 });

    // Mention dropdown should appear with matching user
    await expect(page1.getByTestId('mention-dropdown')).toBeVisible({ timeout: 5000 });
    await expect(page1.getByTestId('mention-dropdown').getByText(name2)).toBeVisible({ timeout: 3000 });

    // Click on the user to insert mention
    await page1.getByTestId('mention-dropdown').getByText(name2).click();

    // Send the message
    await page1.keyboard.press('Enter');

    // Message should contain the @mention rendered as highlighted text
    await expect(
      page1.locator('.group.relative.flex.px-5').filter({ hasText: name2 }).first()
    ).toBeVisible({ timeout: 10000 });

    // The mention should be styled (highlighted)
    await expect(
      page1.locator('.mention-highlight').filter({ hasText: `@${name2}` }).first()
    ).toBeVisible({ timeout: 5000 });

    await context1.close();
    await context2.close();
  });

  test('@mention button inserts @ symbol in editor', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'MentionBtn User', email, 'password123');

    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    // Click the @ button in the toolbar
    await page.getByTestId('mention-button').click();

    // The editor should now contain @
    const editorText = await page.locator('.ql-editor').textContent();
    expect(editorText).toContain('@');

    // Mention dropdown should appear
    await expect(page.getByTestId('mention-dropdown')).toBeVisible({ timeout: 5000 });
  });
});
