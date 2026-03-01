import { test, expect } from '@playwright/test';
import { register, uniqueEmail } from './helpers';

test.describe('User Profiles', () => {
  test('user can view and edit their profile', async ({ page }) => {
    const name = `ProfileUser${Date.now()}`;
    const email = uniqueEmail();
    await register(page, name, email, 'password123');

    // Wait for sidebar to load
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    // Click on user avatar in sidebar to open user menu
    const userMenu = page.getByTestId('user-menu-button');
    await userMenu.click();

    // Click "Profile" option from the dropdown
    await page.getByRole('button', { name: 'Profile' }).click();

    // Profile modal should appear with user's name and email
    const profileModal = page.getByTestId('profile-modal');
    await expect(profileModal).toBeVisible({ timeout: 5000 });
    await expect(profileModal.getByText(name)).toBeVisible();
    await expect(profileModal.getByText(email)).toBeVisible();

    // Click "Edit Profile" button
    await profileModal.getByRole('button', { name: 'Edit Profile' }).click();

    // Edit the bio
    const bioInput = profileModal.locator('textarea[name="bio"]');
    await bioInput.fill('Hello, I am a test user!');

    // Save the profile
    await profileModal.getByRole('button', { name: 'Save' }).click();

    // Bio should be visible in the profile
    await expect(profileModal.getByText('Hello, I am a test user!')).toBeVisible({ timeout: 5000 });
  });

  test('user can view another user profile by clicking their name', async ({ page, browser }) => {
    const name1 = `User1_${Date.now()}`;
    const email1 = uniqueEmail();
    const name2 = `User2_${Date.now()}`;
    const email2 = uniqueEmail();

    // Register first user and send a message
    await register(page, name1, email1, 'password123');
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    // Register second user in a new context
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await register(page2, name2, email2, 'password123');
    await page2.locator('button').filter({ hasText: 'general' }).click();
    await expect(page2.locator('.ql-editor')).toBeVisible({ timeout: 5000 });

    // User 2 sends a message
    const quill2 = page2.locator('.ql-editor');
    await quill2.click();
    await quill2.pressSequentially(`Hello from ${name2}`);
    await page2.keyboard.press('Enter');

    // User 1 waits for the message and clicks on user 2's name
    await expect(page.getByText(`Hello from ${name2}`)).toBeVisible({ timeout: 10000 });
    const msgRow = page.locator('.group.relative.flex.px-5').filter({ hasText: `Hello from ${name2}` }).first();
    await msgRow.locator('button', { hasText: name2 }).click();

    // Profile modal should show user2's info
    const profileModal = page.getByTestId('profile-modal');
    await expect(profileModal).toBeVisible({ timeout: 5000 });
    await expect(profileModal.getByText(name2)).toBeVisible();

    await context2.close();
  });
});
