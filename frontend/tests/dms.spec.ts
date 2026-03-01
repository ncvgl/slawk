import { test, expect } from '@playwright/test';
import { register, uniqueEmail } from './helpers';

test.describe('Direct Messages', () => {
  test('user can start a DM conversation from the teammates dialog', async ({ browser }) => {
    const ts = Date.now();
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();
    const name1 = `DMSender${ts}`;
    const name2 = `DMReceiver${ts}`;

    // Register two users
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await register(page1, name1, email1, 'password123');

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, name2, email2, 'password123');

    // User 1 opens Add teammates dialog
    await page1.getByText('Add teammates').click();
    await expect(page1.getByRole('heading', { name: 'Direct message' })).toBeVisible({ timeout: 5000 });

    // Search for the receiver user
    await page1.getByTestId('teammate-search').fill(name2);
    const userButton = page1.getByRole('button', { name: new RegExp(name2) }).first();
    await expect(userButton).toBeVisible({ timeout: 5000 });
    await userButton.click();

    // Should navigate to the DM conversation view
    await expect(page1.getByTestId('dm-conversation')).toBeVisible({ timeout: 5000 });

    // Should show receiver's name in the header
    await expect(page1.getByTestId('dm-conversation').getByText(name2)).toBeVisible();

    // Send a DM
    const dmInput = page1.getByTestId('dm-message-input');
    await dmInput.fill('Hello from DM!');
    await dmInput.press('Enter');

    // Message should appear in the conversation
    await expect(page1.getByTestId('dm-conversation').getByText('Hello from DM!')).toBeVisible({ timeout: 5000 });

    await context1.close();
    await context2.close();
  });

  test('DM appears in the sidebar DM list', async ({ browser }) => {
    const ts = Date.now();
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();
    const name1 = `SidebarDM1_${ts}`;
    const name2 = `SidebarDM2_${ts}`;

    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await register(page1, name1, email1, 'password123');

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, name2, email2, 'password123');

    // User 1 sends DM to user 2 via Add teammates dialog
    await page1.getByText('Add teammates').click();
    await expect(page1.getByRole('heading', { name: 'Direct message' })).toBeVisible({ timeout: 5000 });

    // Search for user 2
    await page1.getByTestId('teammate-search').fill(name2);
    const userButton = page1.getByRole('button', { name: new RegExp(name2) }).first();
    await expect(userButton).toBeVisible({ timeout: 5000 });
    await userButton.click();
    await expect(page1.getByTestId('dm-conversation')).toBeVisible({ timeout: 5000 });

    const dmInput = page1.getByTestId('dm-message-input');
    await dmInput.fill('Hi there!');
    await dmInput.press('Enter');
    await expect(page1.getByTestId('dm-conversation').getByText('Hi there!')).toBeVisible({ timeout: 5000 });

    // The DM should appear in the sidebar DM list
    await expect(page1.locator('[data-testid="dm-list-item"]').filter({ hasText: name2 })).toBeVisible({ timeout: 5000 });

    await context1.close();
    await context2.close();
  });
});
