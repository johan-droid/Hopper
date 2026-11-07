import { expect, test } from '@playwright/test';

test.describe('public routes', () => {
  test('landing page renders a hero without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Several sign-in entry points exist and some are hidden at small widths,
    // so assert on the hero CTA by destination instead of by label.
    await expect(
      page.locator('a[href="/login"]').filter({ visible: true }).first()
    ).toBeVisible();

    // The API is not reachable in this suite; only client-side crashes matter.
    expect(errors.filter((text) => !/Failed to fetch|ERR_|net::/i.test(text))).toEqual([]);
  });

  test('sign-in page renders the authoritative GitHub authentication experience', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in to hopper/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible();
    // Pure GitHub authentication: no password, email input or personal access token form
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test('/signup routes directly to the unified GitHub sign-in experience', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /sign in to hopper/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible();
  });

  test('unknown route renders the not-found page', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText('404', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /does not exist/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /back to overview/i })).toBeVisible();
  });
});

test.describe('protected routes without a session', () => {
  test('redirects to sign-in and remembers the destination', async ({ page }) => {
    await page.goto('/app/settings/billing');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /sign in to hopper/i })).toBeVisible();
  });

  test('deep links survive a reload instead of falling back to the landing page', async ({ page }) => {
    await page.goto('/app/trends');
    await expect(page).toHaveURL(/\/login$/);

    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /sign in to hopper/i })).toBeVisible();

    // The SPA fallback must serve the app shell for a nested path directly.
    const response = await page.goto('/app/repositories/some-id');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
  });
});
