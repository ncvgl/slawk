import { test, expect } from '@playwright/test';
import { register, uniqueEmail, clickChannel, waitForChannelReady, TEST_PASSWORD } from './helpers';

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
    await register(page1, name1, email1, TEST_PASSWORD);

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, name2, email2, TEST_PASSWORD);

    // User 1 selects general channel and waits for socket join to settle
    await clickChannel(page1, 'general');
    await waitForChannelReady(page1);

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

  // Regression test for: https://github.com/ncvgl/slawk/issues/165
  // When typing two @mentions quickly, stale mentionQuery state caused insertMention
  // to compute the wrong deleteLength, leaving trailing characters as plain text.
  test('two @mentions in sequence produce clean output with no stale text', async ({ browser }) => {
    const ts = Date.now();
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();
    const email3 = uniqueEmail();
    const senderName = `MentionSender${ts}`;
    const target1Name = `AlphaUser${ts}`;
    const target2Name = `BetaUser${ts}`;

    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await register(page1, senderName, email1, TEST_PASSWORD);

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await register(page2, target1Name, email2, TEST_PASSWORD);

    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    await register(page3, target2Name, email3, TEST_PASSWORD);

    await clickChannel(page1, 'general');
    await waitForChannelReady(page1);

    const editor = page1.locator('.ql-editor');
    await editor.click();

    // Type first @mention quickly (simulates fast typing that triggers stale state)
    await page1.keyboard.type(`@${target1Name.slice(0, 9)}`, { delay: 20 });
    await expect(page1.getByTestId('mention-dropdown')).toBeVisible({ timeout: 5000 });
    await expect(page1.getByTestId('mention-dropdown').getByText(target1Name)).toBeVisible({ timeout: 3000 });
    await page1.getByTestId('mention-dropdown').getByText(target1Name).click();

    // Type connecting text then second @mention equally quickly
    await page1.keyboard.type(' and ', { delay: 20 });
    await page1.keyboard.type(`@${target2Name.slice(0, 9)}`, { delay: 20 });
    await expect(page1.getByTestId('mention-dropdown')).toBeVisible({ timeout: 5000 });
    await expect(page1.getByTestId('mention-dropdown').getByText(target2Name)).toBeVisible({ timeout: 3000 });
    await page1.getByTestId('mention-dropdown').getByText(target2Name).click();

    // Capture the raw editor text before sending — must contain exactly the two mention
    // names and no stray suffix fragments (e.g. no trailing "rUser..." from the query)
    const rawEditorText = await editor.textContent() ?? '';
    // The embed nodes render as @Name in the DOM — verify no leftover query fragments
    const target2Suffix = target2Name.slice(9); // characters after what we typed
    // The characters we DID type should appear as part of the embed, not duplicated loose
    const typedQueryChars = target2Name.slice(0, 9);
    // There should be exactly one occurrence of target2Name embedded (not two)
    const occurrences = (rawEditorText.match(new RegExp(target2Name, 'g')) || []).length;
    expect(occurrences).toBe(1);

    // Send the message
    await page1.keyboard.press('Enter');

    // Both mentions should appear styled in the sent message
    const messageRow = page1.locator('.group.relative.flex.px-5').filter({ hasText: target1Name }).first();
    await expect(messageRow).toBeVisible({ timeout: 10000 });
    await expect(messageRow.locator('.ql-mention', { hasText: `@${target1Name}` })).toBeVisible();
    await expect(messageRow.locator('.ql-mention', { hasText: `@${target2Name}` })).toBeVisible();

    // Critically: no stale text fragment from the second query should appear as plain text
    // The message text node (outside .ql-mention spans) should only contain " and "
    const plainText = await messageRow.evaluate((el) => {
      const cloned = el.cloneNode(true) as HTMLElement;
      cloned.querySelectorAll('.ql-mention').forEach((m) => m.remove());
      return cloned.textContent ?? '';
    });
    // Plain text outside mentions should be " and " (with surrounding whitespace) — no name fragments
    expect(plainText.trim()).toBe('and');

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test('@mention button inserts @ symbol in editor', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'MentionBtn User', email, TEST_PASSWORD);

    await clickChannel(page, 'general');
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
