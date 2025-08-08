// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Search and Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.repository-card');
  });

  test('should filter repositories by search term', async ({ page }) => {
    // Get initial repository count
    const initialCount = await page.locator('.repository-card').count();
    
    // Type in search box
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    await searchInput.fill('nginx');
    
    // Wait for debounce and filtering
    await page.waitForTimeout(500);
    
    // Check filtered results
    const filteredCards = page.locator('.repository-card');
    const filteredCount = await filteredCards.count();
    
    // Should have fewer or equal repositories
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    
    // All visible repositories should contain search term
    for (let i = 0; i < filteredCount; i++) {
      const repoName = await filteredCards.nth(i).locator('.repository-name').textContent();
      expect(repoName.toLowerCase()).toContain('nginx');
    }
  });

  test('should clear search and show all repositories', async ({ page }) => {
    // Search for specific term
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    await searchInput.fill('nginx');
    await page.waitForTimeout(500);
    
    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);
    
    // Should show all repositories again
    const allCards = await page.locator('.repository-card').count();
    expect(allCards).toBeGreaterThan(0);
  });

  test('should show no results message for non-matching search', async ({ page }) => {
    // Search for non-existent repository
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    await searchInput.fill('xyz123nonexistent456');
    await page.waitForTimeout(500);
    
    // Check for no results message
    await expect(page.locator('.no-results')).toBeVisible();
    await expect(page.locator('.no-results')).toContainText('No repositories match your search');
  });

  test('should debounce search input', async ({ page }) => {
    let apiCallCount = 0;
    
    // Intercept API calls to count them
    await page.route('**/api/repositories*', async route => {
      apiCallCount++;
      await route.continue();
    });
    
    // Type quickly
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    await searchInput.type('docker', { delay: 50 });
    
    // Wait for debounce period
    await page.waitForTimeout(1000);
    
    // Should have made only 1-2 API calls (initial load + search), not 6 (one per character)
    expect(apiCallCount).toBeLessThanOrEqual(2);
  });

  test('should persist search term in URL query params', async ({ page }) => {
    // Search for term
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    await searchInput.fill('alpine');
    await page.waitForTimeout(500);
    
    // Check URL contains search param
    const url = new URL(page.url());
    expect(url.searchParams.get('search')).toBe('alpine');
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Search term should be preserved
    const searchValue = await searchInput.inputValue();
    expect(searchValue).toBe('alpine');
  });
});