// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Repository Listing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should display the application header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('RepoVista');
    await expect(page.locator('.subtitle')).toContainText('Docker Registry Explorer');
  });

  test('should load and display repository list', async ({ page }) => {
    // Wait for repositories to load
    await page.waitForSelector('.repository-card', { timeout: 10000 });
    
    // Check that repository cards are displayed
    const repositoryCards = page.locator('.repository-card');
    await expect(repositoryCards).toHaveCount.greaterThan(0);
    
    // Check repository card structure
    const firstCard = repositoryCards.first();
    await expect(firstCard.locator('.repository-name')).toBeVisible();
    await expect(firstCard.locator('.tag-count')).toBeVisible();
    await expect(firstCard.locator('.last-updated')).toBeVisible();
  });

  test('should handle empty repository list gracefully', async ({ page }) => {
    // Intercept API call and return empty list
    await page.route('**/api/repositories', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          repositories: [],
          total: 0,
          page: 1,
          limit: 20
        })
      });
    });
    
    await page.reload();
    
    // Check for empty state message
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('No repositories found');
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept API call and return error
    await page.route('**/api/repositories', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Internal server error'
        })
      });
    });
    
    await page.reload();
    
    // Check for error message
    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.error-message')).toContainText('Failed to load repositories');
  });

  test('should show loading state while fetching repositories', async ({ page }) => {
    // Intercept and delay API response
    await page.route('**/api/repositories', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });
    
    await page.reload();
    
    // Check for loading indicator
    await expect(page.locator('.loading-spinner')).toBeVisible();
    
    // Wait for content to load
    await page.waitForSelector('.repository-card', { timeout: 10000 });
    
    // Loading indicator should be hidden
    await expect(page.locator('.loading-spinner')).not.toBeVisible();
  });
});