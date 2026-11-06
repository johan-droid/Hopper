import { expect, test } from '@playwright/test';

/**
 * Baselines are generated per project (desktop 1440x900, mobile 390x844) and
 * committed. Run `npm run test:e2e:update` after an intentional visual change.
 */
test.describe('visual regression', () => {
  test('landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('landing.png', { fullPage: true });
  });

  test('sign-in page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page).toHaveScreenshot('login.png', { fullPage: true });
  });

  test('not-found page', async ({ page }) => {
    await page.goto('/missing-route');
    await expect(page.getByText('404', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('not-found.png', { fullPage: true });
  });
});
