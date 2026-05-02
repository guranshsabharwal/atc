import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
    await page.goto('/');

    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/ATC Simulation/);
});

test('shows demo controls and map', async ({ page }) => {
    await page.goto('/');

    // The KHEF demo overlay renders the mode toggle, Start Demo button, and KPI strip.
    await expect(page.getByRole('button', { name: 'HUMAN' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Start Demo|Run Again/ })).toBeVisible();
    await expect(page.getByText('Departed')).toBeVisible();
    await expect(page.getByText('Near-misses')).toBeVisible();

    // Map renders
    await expect(page.locator('.maplibregl-map')).toBeVisible();
});
