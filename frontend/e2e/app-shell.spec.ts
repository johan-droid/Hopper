import { expect, test, type Page } from '@playwright/test';

/**
 * A syntactically complete Supabase session for the dummy project in
 * playwright.config.ts. It is not a credential: the access token is the literal
 * string below, the expiry is in the future so supabase-js never refreshes it,
 * and every /api request is intercepted.
 */
const SESSION = {
  access_token: 'e2e-fake-access-token',
  refresh_token: 'e2e-fake-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'engineer@example.com',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    phone: '',
    confirmed_at: '2026-01-01T00:00:00.000Z',
    last_sign_in_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
};

const seedSession = async (page: Page) => {
  // The client sets an explicit storage key in lib/supabase.ts.
  await page.addInitScript((session) => {
    window.localStorage.setItem('hopper.auth', JSON.stringify(session));
  }, SESSION);

  // Keep the suite fast and deterministic: no request leaves the browser.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"e2e_stub"}' })
  );
};

test.describe('authenticated shell', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
  });

  test('renders both navigation groups and the workspace chrome', async ({ page }) => {
    await page.goto('/app/overview');

    const nav = page.getByRole('navigation', { name: /primary/i });
    await expect(nav.getByRole('link', { name: 'Overview' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Repositories' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Diagnosis History' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Billing & Usage' })).toBeVisible();

    await expect(page.getByRole('main')).toBeVisible();
  });

  test('deep link stays on the requested path across a reload', async ({ page }) => {
    await page.goto('/app/diagnoses');
    await expect(page).toHaveURL(/\/app\/diagnoses$/);

    await page.reload();
    await expect(page).toHaveURL(/\/app\/diagnoses$/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('command palette navigates between routes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The palette is a desktop keyboard affordance.');
    await page.goto('/app/overview');

    await page.getByRole('button', { name: /open command palette/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.type('billing');
    await dialog.getByRole('option', { name: /billing/i }).first().click();
    await expect(page).toHaveURL(/\/app\/settings\/billing$/);
  });

  test('settings redirects to the general tab and tab links update the URL', async ({ page }) => {
    await page.goto('/app/settings');
    await expect(page).toHaveURL(/\/app\/settings\/general$/);

    const tabs = page.getByRole('navigation', { name: /settings sections/i });
    await tabs.getByRole('link', { name: 'Members' }).click();
    await expect(page).toHaveURL(/\/app\/settings\/members$/);
    await expect(tabs.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
  });

  test('an invalid failure id is rejected without a request', async ({ page }) => {
    await page.goto('/app/failures/not%20a%20valid%20id');
    await expect(page.getByRole('heading', { name: /invalid failure id/i })).toBeVisible();
  });
});
