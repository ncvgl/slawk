import { test, expect } from '@playwright/test';
import { register, uniqueEmail } from './helpers';

test.describe('DM Message Actions', () => {
  test('can edit own DM message', async ({ browser }) => {
    const ts = Date.now();
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();
    const name1 = `DMEdit_Sender_${ts}`;
    const name2 = `DMEdit_Receiver_${ts}`;

    // Register two users
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await register(page1, name1, email1, 'password123');

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, name2, email2, 'password123');

    // User 1 opens Add teammates dialog and DMs user 2
    await page1.getByText('Add teammates').click();
    await expect(page1.getByRole('heading', { name: 'Direct message' })).toBeVisible({ timeout: 5000 });
    await page1.getByTestId('teammate-search').fill(name2);
    const userButton = page1.getByRole('button', { name: new RegExp(name2) }).first();
    await expect(userButton).toBeVisible({ timeout: 5000 });
    await userButton.click();
    await expect(page1.getByTestId('dm-conversation')).toBeVisible({ timeout: 5000 });

    // Send a DM
    const dmInput = page1.getByTestId('dm-message-input');
    await expect(dmInput).toBeVisible({ timeout: 5000 });
    await dmInput.click();
    await dmInput.fill('Original message');
    await dmInput.press('Enter');
    await expect(page1.getByTestId('dm-conversation').getByText('Original message')).toBeVisible({ timeout: 8000 });

    // Hover over the message to show the toolbar
    const msgRow = page1.getByTestId('dm-conversation').locator('div').filter({ hasText: 'Original message' }).last();
    await msgRow.hover();

    // Click "More actions" button
    const moreBtn = page1.getByTestId('dm-more-btn').first();
    await expect(moreBtn).toBeVisible({ timeout: 3000 });
    await moreBtn.click();

    // Click "Edit message" in the dropdown
    const editBtn = page1.getByTestId('dm-edit-btn').first();
    await expect(editBtn).toBeVisible({ timeout: 3000 });
    await editBtn.click();

    // The edit textarea should appear with the original content
    const editInput = page1.getByTestId('dm-edit-input');
    await expect(editInput).toBeVisible({ timeout: 3000 });
    await expect(editInput).toHaveValue('Original message');

    // Clear and type new content
    await editInput.clear();
    await editInput.fill('Edited message');

    // Click Save
    const saveBtn = page1.getByTestId('dm-edit-save');
    await saveBtn.click();

    // The edited message should now appear
    await expect(page1.getByTestId('dm-conversation').getByText('Edited message')).toBeVisible({ timeout: 5000 });
    // Original message should be gone
    await expect(page1.getByTestId('dm-conversation').getByText('Original message')).not.toBeVisible();

    await context1.close();
    await context2.close();
  });

  test('can delete own DM message', async ({ browser }) => {
    const ts = Date.now();
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();
    const name1 = `DMDelete_Sender_${ts}`;
    const name2 = `DMDelete_Receiver_${ts}`;

    // Register two users
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await register(page1, name1, email1, 'password123');

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, name2, email2, 'password123');

    // User 1 DMs user 2
    await page1.getByText('Add teammates').click();
    await expect(page1.getByRole('heading', { name: 'Direct message' })).toBeVisible({ timeout: 5000 });
    await page1.getByTestId('teammate-search').fill(name2);
    const userButton = page1.getByRole('button', { name: new RegExp(name2) }).first();
    await expect(userButton).toBeVisible({ timeout: 5000 });
    await userButton.click();
    await expect(page1.getByTestId('dm-conversation')).toBeVisible({ timeout: 5000 });

    // Send a DM
    const dmInput = page1.getByTestId('dm-message-input');
    await expect(dmInput).toBeVisible({ timeout: 5000 });
    await dmInput.click();
    await dmInput.fill('Message to delete');
    await dmInput.press('Enter');
    await expect(page1.getByTestId('dm-conversation').getByText('Message to delete')).toBeVisible({ timeout: 8000 });

    // Hover to show toolbar
    const msgRow = page1.getByTestId('dm-conversation').locator('div').filter({ hasText: 'Message to delete' }).last();
    await msgRow.hover();

    // Click "More actions"
    const moreBtn = page1.getByTestId('dm-more-btn').first();
    await expect(moreBtn).toBeVisible({ timeout: 3000 });
    await moreBtn.click();

    // Click "Delete message"
    const deleteBtn = page1.getByTestId('dm-delete-btn').first();
    await expect(deleteBtn).toBeVisible({ timeout: 3000 });
    await deleteBtn.click();

    // The message should be removed from the conversation
    await expect(page1.getByTestId('dm-conversation').getByText('Message to delete')).not.toBeVisible({ timeout: 5000 });

    await context1.close();
    await context2.close();
  });

  test('cannot edit or delete another user\'s DM', async ({ browser }) => {
    const ts = Date.now();
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();
    const name1 = `DMOther_Sender_${ts}`;
    const name2 = `DMOther_Receiver_${ts}`;

    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await register(page1, name1, email1, 'password123');

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, name2, email2, 'password123');

    // User 1 sends DM to user 2
    await page1.getByText('Add teammates').click();
    await expect(page1.getByRole('heading', { name: 'Direct message' })).toBeVisible({ timeout: 5000 });
    await page1.getByTestId('teammate-search').fill(name2);
    const userButton1 = page1.getByRole('button', { name: new RegExp(name2) }).first();
    await expect(userButton1).toBeVisible({ timeout: 5000 });
    await userButton1.click();
    await expect(page1.getByTestId('dm-conversation')).toBeVisible({ timeout: 5000 });

    const dmInput1 = page1.getByTestId('dm-message-input');
    await dmInput1.fill('Hello from user 1');
    await dmInput1.press('Enter');
    await expect(page1.getByTestId('dm-conversation').getByText('Hello from user 1')).toBeVisible({ timeout: 5000 });

    // User 2 opens the conversation and views user 1's message
    await page2.getByText('Add teammates').click();
    await expect(page2.getByRole('heading', { name: 'Direct message' })).toBeVisible({ timeout: 5000 });
    await page2.getByTestId('teammate-search').fill(name1);
    const userButton2 = page2.getByRole('button', { name: new RegExp(name1) }).first();
    await expect(userButton2).toBeVisible({ timeout: 5000 });
    await userButton2.click();
    await expect(page2.getByTestId('dm-conversation')).toBeVisible({ timeout: 5000 });
    await expect(page2.getByTestId('dm-conversation').getByText('Hello from user 1')).toBeVisible({ timeout: 5000 });

    // User 2 hovers over user 1's message and opens more actions
    const msgRow = page2.getByTestId('dm-conversation').locator('div').filter({ hasText: 'Hello from user 1' }).last();
    await msgRow.hover();

    const moreBtn = page2.getByTestId('dm-more-btn').first();
    await expect(moreBtn).toBeVisible({ timeout: 3000 });
    await moreBtn.click();

    // Edit and delete buttons should NOT be visible (not the owner)
    await expect(page2.getByTestId('dm-edit-btn')).not.toBeVisible();
    await expect(page2.getByTestId('dm-delete-btn')).not.toBeVisible();

    await context1.close();
    await context2.close();
  });
});
