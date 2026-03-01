import { test, expect } from '@playwright/test';
import { login, register, uniqueEmail, sendMessage, waitForMessage } from './helpers';

test.describe('Bug #1: No console errors for non-member channels', () => {
  test('page loads without "must be a member" errors', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Bug1 User', email, 'password123');

    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Reload the page to trigger channel fetching
    await page.reload();
    await expect(page.getByRole('button', { name: 'Channels', exact: true })).toBeVisible({ timeout: 10_000 });

    // Wait a moment for any async errors to fire
    await page.waitForTimeout(2_000);

    // Check that no "must be a member" errors appeared
    const memberErrors = consoleErrors.filter((e) => e.includes('must be a member'));
    expect(memberErrors).toHaveLength(0);
  });
});

test.describe('Bug #2: New users auto-joined to default channels', () => {
  test('new user sees general and random channels after registration', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Bug2 User', email, 'password123');

    // User should see #general and #random in the sidebar (use first() to avoid ambiguity with header)
    await expect(page.locator('button').filter({ hasText: 'general' }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button').filter({ hasText: 'random' }).first()).toBeVisible({ timeout: 5_000 });

    // User should be able to send a message (proving they're a member)
    await page.locator('button').filter({ hasText: 'general' }).first().click();
    await expect(page.locator('.ql-editor')).toBeVisible();
    const testMsg = `Auto-join test ${Date.now()}`;
    await sendMessage(page, testMsg);
    await waitForMessage(page, testMsg);
  });
});

test.describe('Bug #3: Channel browser to join existing channels', () => {
  test('user can browse and join existing channels', async ({ browser }) => {
    // User 1 creates a channel
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const email1 = uniqueEmail();
    await register(page1, 'Creator', email1, 'password123');
    const channelName = `browse-${Date.now()}`;
    await page1.locator('button').filter({ hasText: 'Add channels' }).click();
    // Fill in channel name in the Create tab
    await expect(page1.getByPlaceholder(/plan-budget/i)).toBeVisible({ timeout: 3_000 });
    await page1.getByPlaceholder(/plan-budget/i).fill(channelName);
    const responsePromise = page1.waitForResponse(
      (resp) => resp.url().includes('/channels') && resp.request().method() === 'POST'
    );
    await page1.getByRole('button', { name: /create$/i }).click();
    await responsePromise;

    // User 2 registers and should be able to browse/join that channel
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    const email2 = uniqueEmail();
    await register(page2, 'Joiner', email2, 'password123');

    // Click "Add channels" - should show a dialog with tabs
    await page2.locator('button').filter({ hasText: 'Add channels' }).click();

    // Click "Browse channels" tab
    await page2.getByRole('button', { name: /browse channels/i }).click();

    // Should see the channel in the browse list (within the dialog)
    const browseItem = page2.locator(`[data-channel-name="${channelName}"]`);
    await expect(browseItem).toBeVisible({ timeout: 5_000 });

    // Click Join on that channel
    await browseItem.getByRole('button', { name: /join/i }).click();

    // Channel should now appear in sidebar
    await expect(
      page2.locator('button').filter({ hasText: channelName })
    ).toBeVisible({ timeout: 5_000 });

    await ctx1.close();
    await ctx2.close();
  });
});

test.describe('Bug #4: Search functionality', () => {
  test('user can search for messages', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Search User', email, 'password123');

    // Wait for general channel to appear and click it
    await expect(page.locator('button').filter({ hasText: 'general' })).toBeVisible({ timeout: 10_000 });
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible();
    const searchTerm = `searchable-${Date.now()}`;
    await sendMessage(page, searchTerm);
    await waitForMessage(page, searchTerm);

    // Type in search input
    const searchInput = page.locator('input[placeholder="Search"]');
    await searchInput.fill(searchTerm);
    await searchInput.press('Enter');

    // Search results should appear
    await expect(page.getByText(searchTerm).first()).toBeVisible({ timeout: 5_000 });

    // Press Escape to clear
    await searchInput.press('Escape');
    await expect(searchInput).toHaveValue('');
  });
});

test.describe('Bug #5: Logout functionality', () => {
  test('user can log out via avatar menu', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Logout User', email, 'password123');

    // Click avatar in the nav rail
    await page.locator('[data-testid="user-menu-button"]').click();

    // Should see a menu with logout option
    await expect(page.getByRole('button', { name: /log\s?out|sign\s?out/i })).toBeVisible();

    // Click logout
    await page.getByRole('button', { name: /log\s?out|sign\s?out/i }).click();

    // Should be redirected to login page
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Bug #9: Registration error display', () => {
  test('shows error when registration fails with duplicate email', async ({ page }) => {
    const email = uniqueEmail();

    // Register first time - should succeed
    await register(page, 'First User', email, 'password123');

    // Clear localStorage and navigate to register page again
    await page.evaluate(() => localStorage.clear());
    await page.goto('/register');

    // Try to register again with same email
    await page.getByPlaceholder('Full name').fill('Second User');
    await page.getByPlaceholder('name@work-email.com').fill(email);
    await page.getByPlaceholder('Password', { exact: true }).fill('password123');
    await page.getByPlaceholder('Confirm password').fill('password123');
    await page.getByRole('button', { name: /create account/i }).click();

    // Should show error message
    await expect(page.getByText(/already registered|already exists|error/i)).toBeVisible({ timeout: 5_000 });
  });

  test('shows error for mismatched passwords', async ({ page }) => {
    await page.goto('/register');
    await page.getByPlaceholder('Full name').fill('Mismatch User');
    await page.getByPlaceholder('name@work-email.com').fill(uniqueEmail());
    await page.getByPlaceholder('Password', { exact: true }).fill('password123');
    await page.getByPlaceholder('Confirm password').fill('differentpassword');
    await page.getByRole('button', { name: /create account/i }).click();

    // Should show error about password mismatch
    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Bug #10: Create channel validation', () => {
  test('shows validation error for empty channel name', async ({ page }) => {
    await login(page);
    await page.locator('button').filter({ hasText: 'Add channels' }).click();

    // Create button should be disabled when name is empty
    const createBtn = page.getByRole('button', { name: /create$/i });
    await expect(createBtn).toBeDisabled();

    // Type whitespace only
    await page.getByPlaceholder(/plan-budget/i).fill('   ');
    await expect(createBtn).toBeDisabled();
  });
});

test.describe('Bug #11: Add teammates button', () => {
  test('add teammates button opens a user picker dialog', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'DM User', email, 'password123');

    // Wait for sidebar to load
    await expect(page.locator('button').filter({ hasText: 'Add teammates' })).toBeVisible({ timeout: 10_000 });

    // Click Add teammates
    await page.locator('button').filter({ hasText: 'Add teammates' }).click();

    // Should show a dialog/modal for finding users
    await expect(page.getByText('Find or start a conversation')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Bug #12: Channel star/favorite', () => {
  test('starring a channel adds it to a Starred section in the sidebar', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Star User', email, 'password123');

    // Open general channel
    await expect(page.locator('button').filter({ hasText: 'general' })).toBeVisible({ timeout: 10_000 });
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible();

    // Click the star button in the channel header
    await page.locator('[data-testid="star-channel-button"]').click();

    // A "Starred" section should appear in the sidebar
    await expect(page.getByText('Starred', { exact: true })).toBeVisible({ timeout: 3_000 });

    // The general channel should appear under the Starred section
    const starredSection = page.locator('[data-testid="starred-section"]');
    await expect(starredSection).toBeVisible();
    await expect(starredSection.locator('button').filter({ hasText: 'general' })).toBeVisible();
  });

  test('un-starring a channel removes it from the Starred section', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Unstar User', email, 'password123');

    await expect(page.locator('button').filter({ hasText: 'general' })).toBeVisible({ timeout: 10_000 });
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible();

    // Star it
    await page.locator('[data-testid="star-channel-button"]').click();
    await expect(page.getByText('Starred', { exact: true })).toBeVisible({ timeout: 3_000 });

    // Un-star it
    await page.locator('[data-testid="star-channel-button"]').click();

    // Starred section should disappear (no starred channels)
    await expect(page.getByText('Starred', { exact: true })).not.toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Bug #11: Reaction emoji larger inside pill', () => {
  test('reaction emoji span has font-size of 16px', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'EmojiSize User', email, 'password123');

    await page.locator('button').filter({ hasText: 'general' }).first().click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    const msg = `emoji-size-${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: msg });

    // Add a 👍 reaction via hover toolbar
    await messageRow.hover();
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    await hoverToolbar.locator('button').first().click();
    const searchBox = page.getByRole('searchbox', { name: 'Search' });
    await expect(searchBox).toBeVisible({ timeout: 5_000 });
    await searchBox.fill('thumbsup');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '👍', exact: true }).click();

    // Wait for reaction pill to appear
    const reactionPill = messageRow.locator('button.inline-flex.items-center.gap-1').first();
    await expect(reactionPill).toBeVisible({ timeout: 5_000 });

    // The emoji span (first span in the pill, marked data-testid) must be 16px
    const emojiSpan = reactionPill.locator('[data-testid="reaction-emoji"]');
    await expect(emojiSpan).toHaveCSS('font-size', '16px');
  });
});

test.describe('Bug #10: No video icon in message composer', () => {
  test('video camera button is not present in the composer toolbar', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'NoVideo User', email, 'password123');

    await expect(page.locator('button').filter({ hasText: 'general' })).toBeVisible({ timeout: 10_000 });
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible();

    // The video button should NOT exist in the composer bottom toolbar
    // (lucide Video icon renders as an SVG with a specific path shape)
    await expect(page.locator('[data-testid="video-call-button"]')).toHaveCount(0);
  });
});

test.describe('Bug #9: Pinned message has orange background', () => {
  test('pinned message row shows #FEF9ED background', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'PinBg User', email, 'password123');

    await expect(page.locator('button').filter({ hasText: 'general' })).toBeVisible({ timeout: 10_000 });
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible();

    const msg = `pin-bg-${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: msg });
    await messageRow.hover();

    // Open the ⋮ more menu (4th button in hover toolbar)
    const toolbar = messageRow.locator('.absolute.-top-4.right-5').first();
    await toolbar.locator('button').nth(3).click();

    // Pin the message
    await page.getByRole('button', { name: /^pin message$/i }).click();

    // The message row must now have #FEF9ED background (rgb(254, 249, 237))
    await expect(messageRow).toHaveCSS('background-color', 'rgb(254, 249, 237)');
  });
});

test.describe('Bug #12: Bookmark button', () => {
  test('bookmark button shows feedback when clicked', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, 'Bookmark User', email, 'password123');

    // Wait for general channel and click it
    await expect(page.locator('button').filter({ hasText: 'general' })).toBeVisible({ timeout: 10_000 });
    await page.locator('button').filter({ hasText: 'general' }).click();
    await expect(page.locator('.ql-editor')).toBeVisible();
    const msg = `Bookmark test ${Date.now()}`;
    await sendMessage(page, msg);
    await waitForMessage(page, msg);

    // Hover over the message
    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: msg });
    await messageRow.hover();

    // The hover toolbar should appear - click the bookmark button (3rd button in toolbar)
    const hoverToolbar = page.locator('.absolute.-top-4.right-5');
    await expect(hoverToolbar).toBeVisible();
    // Bookmark is the 3rd button
    await hoverToolbar.locator('button').nth(2).click();

    // The bookmark icon should now have yellow fill
    await expect(hoverToolbar.locator('.text-yellow-500')).toBeVisible({ timeout: 3_000 });
  });
});
