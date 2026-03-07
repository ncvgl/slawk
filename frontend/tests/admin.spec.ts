import { test, expect, type Page } from '@playwright/test';
import { login, register, uniqueEmail } from './helpers';

async function loginAsAdmin(page: Page) {
  await login(page, 'alice@slawk.dev', 'password123');

  // Wait for channels to fully load in the sidebar (indicates app is stable)
  await expect(
    page.getByTestId('sidebar')
      .locator('button')
      .filter({ has: page.locator('span.truncate', { hasText: 'general' }) })
      .first()
  ).toBeVisible({ timeout: 10_000 });
}

async function navigateToAdmin(page: Page) {
  await loginAsAdmin(page);

  // Force click bypasses Playwright's stability check (avoids DOM detach from re-renders)
  await page.getByTestId('nav-item-admin').click({ force: true });
  await expect(page.locator('main').getByText('Admin Panel')).toBeVisible({ timeout: 10_000 });
}

test.describe('Admin Panel - Admin Access', () => {
  test('admin user sees Shield icon and can navigate to admin panel', async ({ page }) => {
    await loginAsAdmin(page);

    // Admin button should be visible
    await expect(page.getByTestId('nav-item-admin')).toBeVisible();

    // Navigate to admin panel
    await page.getByTestId('nav-item-admin').click({ force: true });
    await expect(page.locator('main').getByText('Admin Panel')).toBeVisible({ timeout: 10_000 });

    // Three tabs visible (scoped to main to avoid sidebar collision)
    const main = page.locator('main');
    await expect(main.getByRole('button', { name: /Members/ })).toBeVisible();
    await expect(main.getByRole('button', { name: /Invites/ })).toBeVisible();
    await expect(main.getByRole('button', { name: /Channels/ })).toBeVisible();
  });

  test('members tab shows user list with (you) and search', async ({ page }) => {
    await navigateToAdmin(page);

    const main = page.locator('main');

    // Members tab is default — wait for table to load with data rows
    await expect(main.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });
    await expect(main.getByText('(you)')).toBeVisible();

    // Search works
    const searchInput = main.getByPlaceholder('Search members...');
    await searchInput.fill('Nathan');
    await expect(main.getByText('Nathan Cavaglione')).toBeVisible();
  });

  test('invites tab - create and delete invite', async ({ page }) => {
    await navigateToAdmin(page);

    const main = page.locator('main');
    await main.getByRole('button', { name: /Invites/ }).click();

    // Create invite
    await main.getByRole('button', { name: /Create/ }).click();
    await expect(main.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });

    // Delete invite
    await main.getByTitle('Delete invite').first().click();
    await expect(main.getByText('No invite links yet')).toBeVisible({ timeout: 5_000 });
  });

  test('channels tab shows channels', async ({ page }) => {
    await navigateToAdmin(page);

    const main = page.locator('main');
    await main.getByRole('button', { name: /Channels/ }).click();

    await expect(main.locator('table')).toBeVisible({ timeout: 10_000 });
    await expect(main.locator('table').getByText('general')).toBeVisible();
  });
});

test.describe('Admin Panel - Non-Admin Access', () => {
  test('non-admin user does not see Shield icon', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Regular User', email, 'password123');

    // Wait for sidebar to be fully loaded
    await expect(
      page.getByTestId('sidebar')
        .locator('button')
        .filter({ has: page.locator('span.truncate', { hasText: 'general' }) })
        .first()
    ).toBeVisible({ timeout: 10_000 });

    const adminButton = page.getByTestId('nav-item-admin');
    await expect(adminButton).not.toBeVisible({ timeout: 3_000 });
  });

  test('non-admin cannot access /admin directly', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Regular User', email, 'password123');

    await page.goto('/admin');
    // Should redirect away from /admin
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 10_000 });
  });
});
