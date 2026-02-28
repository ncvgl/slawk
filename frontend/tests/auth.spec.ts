import { test, expect } from '@playwright/test';
import { login, register, uniqueEmail, TEST_USER } from './helpers';

test.describe('Authentication', () => {
  test('user can register with name, email, password', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'New Tester', email, 'securepass123');

    // Should be on the main app with sidebar visible
    await expect(page.getByRole('button', { name: 'Channels', exact: true })).toBeVisible();
    // Should see channel list (general should exist by default)
    await expect(page.locator('button').filter({ hasText: 'general' })).toBeVisible();
  });

  test('user can login with email and password', async ({ page }) => {
    await login(page);

    // Should be on the main app with the sidebar visible
    await expect(page.getByRole('button', { name: 'Channels', exact: true })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'general' })).toBeVisible();
  });

  test('login fails with wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('name@work-email.com').fill(TEST_USER.email);
    await page.getByPlaceholder('Password').fill('wrongpassword999');
    await page.getByRole('button', { name: /sign in with email/i }).click();

    // Should remain on the login page (not navigate away)
    await expect(page).toHaveURL(/\/login/);

    // Should show an error indication — either an alert, toast, or inline error
    // The login page should NOT transition to the channels view
    await expect(page.getByRole('button', { name: 'Channels', exact: true })).not.toBeVisible({ timeout: 3_000 });
  });

  test('after successful login, user sees channels page', async ({ page }) => {
    // Register a fresh user first, then login
    const email = uniqueEmail();
    await register(page, 'Login Tester', email, 'password123');

    // The Slawk workspace header should be visible
    await expect(page.locator('text=Slawk')).toBeVisible();

    // Sidebar channel list should be visible
    await expect(page.getByRole('button', { name: 'Channels', exact: true })).toBeVisible();

    // At least the #general channel should be present
    await expect(page.locator('button').filter({ hasText: 'general' }).first()).toBeVisible();

    // The message input area should be visible for the active channel
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 10_000 });
  });
});
